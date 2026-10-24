/**
 * ท่อนำเข้าข้อมูล: รับไฟล์ (ZIP/MD/TXT/CSV/XLSX/JSON) → ตรวจ → แยกรายการ → ทำดัชนี
 * กันซ้ำด้วย content hash, แยกไฟล์ผิดบริบท/ไฟล์ว่าง, แจ้งรายงานทุกรายการ
 * ใช้ร่วมกันทั้ง API (/api/docs/import) และสคริปต์นำเข้าคลัง (scripts/import-corpus.ts)
 */

import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { chunkMarkdown, chunkTable, normalizeText } from '@/lib/rag'
import type { ImportItem } from '@/lib/types'

export interface ImportFile {
  name: string
  buffer: Buffer | Uint8Array
  /** ชื่อไฟล์ zip ต้นทาง เมื่อมาจากการแตก zip */
  fromZip?: string
}

export interface ImportResult {
  found: number
  imported: number
  skipped: number
  failed: number
  items: ImportItem[]
  ms: number
}

const MEDICAL_RE = /(ศัลยกรรม|ผ่าตัด|การระงับความรู้สึก|ambulatory|surgic|outpatient|ผู้ป่วย|โรงพยาบาล|infection control|ห้องคลอด|ทันตกรรม)/i
const CODE_EXT = /\.(js|ts|tsx|py|java|go|rs|php|rb|c|cpp|h|html|css|json5|sh|bat)$/i
const MAX_CHUNKS_PER_DOC = 4000

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}

function pickTitle(content: string, filename: string): string {
  const m = /^#\s+(.+)$/m.exec(content)
  if (m && m[1].trim()) return m[1].trim().slice(0, 160)
  const first = content
    .split('\n')
    .map((l) => l.trim())
    // ข้ามบรรทัดอ้างอิงแหล่งที่มา (NotebookLM export) ลิงก์ ตาราง และรูปภาพ — ไม่ใช้เป็นชื่อเอกสาร
    .find(
      (l) =>
        l.length > 3 &&
        l.length <= 200 &&
        !l.startsWith('>') &&
        !l.startsWith('|') &&
        !l.startsWith('![') &&
        !/^source:/i.test(l) &&
        !/https?:\/\//.test(l),
    )
  if (first) return first.replace(/^#+\s*/, '').slice(0, 160)
  // ใช้ชื่อไฟล์ (ตัดนามสกุล) — ชัดและคงที่ที่สุดสำหรับ corpus นี้
  return filename.replace(/\.[^.]+$/, '').slice(0, 160)
}

function safeEntryPath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\')) return false
  const parts = p.split('/')
  return !parts.includes('..') && !parts.some((s) => s.startsWith('.'))
}

async function ensureDocument(opts: {
  title: string
  source: string | null
  sourceType: string
  category: string
  mimeType: string | null
  size: number
  content: string
  chunks: { idx: number; heading: string | null; content: string }[]
  forceStatus?: string
  note?: string
}): Promise<{ status: 'imported' | 'skipped'; docStatus: string; note?: string }> {
  const hash = sha1(normalizeText(opts.content))
  const dup = await db.document.findFirst({ where: { contentHash: hash, source: opts.source }, select: { id: true } })
  if (dup) return { status: 'skipped', docStatus: 'published', note: 'นำเข้าไปแล้ว (เนื้อหาซ้ำ)' }

  const review = opts.forceStatus === 'review' || MEDICAL_RE.test(opts.title) || MEDICAL_RE.test(opts.content.slice(0, 3000))
  const status = review ? 'review' : opts.forceStatus ?? 'published'
  if (opts.chunks.length > MAX_CHUNKS_PER_DOC) {
    return { status: 'skipped', docStatus: 'error', note: `เอกสารใหญ่เกิน (${opts.chunks.length} ชิ้น)` }
  }
  const doc = await db.document.create({
    data: {
      title: opts.title,
      source: opts.source,
      sourceType: opts.sourceType,
      category: opts.category,
      mimeType: opts.mimeType,
      size: opts.size,
      contentHash: hash,
      status,
      note: opts.note ?? (review ? 'พบคำที่อาจเกี่ยวกับ ASC ทางการแพทย์ — รอผู้ดูแลตรวจสอบ' : null),
      version: 1,
    },
  })
  await db.chunk.createMany({
    data: opts.chunks.map((c) => ({ documentId: doc.id, idx: c.idx, heading: c.heading, content: c.content })),
  })
  return { status: 'imported', docStatus: status, note: opts.note }
}

async function importTextFile(f: ImportFile): Promise<ImportItem> {
  const label = f.fromZip ? `${f.fromZip} → ${f.name}` : f.name
  const text = Buffer.from(f.buffer).toString('utf-8').trim()
  if (text.length < 12) {
    return { file: label, status: 'failed', error: 'ไฟล์ว่างหรืออ่านเนื้อหาไม่ได้ (ข้อมูลขาด)' }
  }
  const chunks = chunkMarkdown(text)
  const res = await ensureDocument({
    title: pickTitle(text, f.name),
    source: f.fromZip ?? f.name,
    sourceType: f.fromZip ? 'zip' : 'upload',
    category: /คู่มือ|manual/i.test(label) ? 'manual' : /spec|product|ผลิตภัณฑ์/i.test(label) ? 'product' : 'general',
    mimeType: 'text/markdown',
    size: text.length,
    content: text,
    chunks,
  })
  return { file: label, status: res.status, chunks: chunks.length, docStatus: res.docStatus, note: res.note }
}

async function importTableFile(f: ImportFile): Promise<ImportItem> {
  const label = f.fromZip ? `${f.fromZip} → ${f.name}` : f.name
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(f.buffer, { type: 'buffer', raw: false, codepage: 65001 })
  } catch {
    return { file: label, status: 'failed', error: 'อ่านไฟล์ตารางไม่สำเร็จ' }
  }
  let totalChunks = 0
  const parts: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
    if (rows.length < 2) continue
    const header = (rows[0] as string[]).map((h) => String(h ?? '').trim())
    const body = rows.slice(1) as string[][]
    const tableChunks = chunkTable(header, body)
    const tableText = tableChunks.map((c) => c.content).join('\n\n')
    parts.push(`# ${sheetName}\n\n${tableText}`)
    totalChunks += tableChunks.length
  }
  const text = parts.join('\n\n').trim()
  if (text.length < 12) {
    return { file: label, status: 'failed', error: 'ตารางว่างหรือไม่มีข้อมูลแถว' }
  }
  const res = await ensureDocument({
    title: f.name.replace(/\.[^.]+$/, ''),
    source: f.fromZip ?? f.name,
    sourceType: f.fromZip ? 'zip' : 'upload',
    category: /bug|request|เคส|case/i.test(label) ? 'cases' : 'general',
    mimeType: f.name.endsWith('.csv') ? 'text/csv' : 'application/vnd.ms-excel',
    size: text.length,
    content: text,
    chunks: chunkMarkdown(text),
  })
  return { file: label, status: res.status, chunks: totalChunks, docStatus: res.docStatus, note: res.note }
}

async function importJsonFile(f: ImportFile): Promise<ImportItem[]> {
  const label = f.fromZip ? `${f.fromZip} → ${f.name}` : f.name
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(f.buffer).toString('utf-8'))
  } catch {
    return [{ file: label, status: 'failed', error: 'JSON ไม่ถูกต้อง' }]
  }
  // รองรับ NotebookLM export: { metadata..., sources: [{title, content/text...}] }
  const sources = (parsed as { sources?: unknown[] })?.sources
  if (Array.isArray(sources) && sources.length > 0) {
    const out: ImportItem[] = []
    for (const s of sources) {
      const obj = s as { title?: string; name?: string; content?: string; text?: string; body?: string }
      const content = String(obj.content ?? obj.text ?? obj.body ?? '').trim()
      const title = String(obj.title ?? obj.name ?? 'source').slice(0, 160)
      if (content.length < 12) {
        out.push({ file: `${label} → ${title}`, status: 'failed', error: 'รายการว่าง (ข้อมูลขาด)' })
        continue
      }
      const chunks = chunkMarkdown(content)
      const res = await ensureDocument({
        title,
        source: label,
        sourceType: f.fromZip ? 'zip' : 'upload',
        category: 'general',
        mimeType: 'application/json',
        size: content.length,
        content,
        chunks,
      })
      out.push({ file: `${label} → ${title}`, status: res.status, chunks: chunks.length, docStatus: res.docStatus, note: res.note })
    }
    return out
  }
  // JSON ทั่วไป → เก็บเป็นข้อความ
  const text = JSON.stringify(parsed, null, 2)
  if (text.length < 12) return [{ file: label, status: 'failed', error: 'ไฟล์ว่าง' }]
  const chunks = chunkMarkdown(text)
  const res = await ensureDocument({
    title: f.name.replace(/\.[^.]+$/, ''),
    source: f.fromZip ?? f.name,
    sourceType: f.fromZip ? 'zip' : 'upload',
    category: 'general',
    mimeType: 'application/json',
    size: text.length,
    content: text,
    chunks,
  })
  return [{ file: label, status: res.status, chunks: chunks.length, docStatus: res.docStatus, note: res.note }]
}

async function importZip(f: ImportFile, depth = 0): Promise<ImportItem[]> {
  const label = f.fromZip ? `${f.fromZip} → ${f.name}` : f.name
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(f.buffer)
  } catch {
    return [{ file: label, status: 'failed', error: 'แตกไฟล์ ZIP ไม่สำเร็จ' }]
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir)
  if (entries.length > 800) {
    return [{ file: label, status: 'failed', error: `ZIP มีไฟล์มากเกินไป (${entries.length} รายการ)` }]
  }

  const knowledge: ImportFile[] = []
  let codeCount = 0
  let imageCount = 0
  let dataCount = 0

  for (const entry of entries) {
    if (!safeEntryPath(entry.name)) continue
    if (/(^|\/)(node_modules|\.git|__MACOSX)(\/|$)/.test(entry.name)) continue
    if (CODE_EXT.test(entry.name) || /package\.json$/i.test(entry.name) || /(^|\/)readme\.md$/i.test(entry.name)) {
      codeCount += 1
      continue
    }
    if (/\.(png|jpe?g|gif|webp|svg|ico|pdf|docx?|pptx?)$/i.test(entry.name)) {
      imageCount += 1
      continue
    }
    if (/\.(md|markdown|txt|csv|xlsx|xls|json)$/i.test(entry.name)) {
      dataCount += 1
      const buf = await entry.async('nodebuffer')
      if (buf.length > 30 * 1024 * 1024) continue
      knowledge.push({ name: entry.name, buffer: buf, fromZip: f.name })
    }
  }

  // ZIP ของเครื่องมือ/ซอร์สโค้ด ไม่ใช่ฐานความรู้ — ไม่นำเข้า
  if (dataCount === 0 && codeCount > 0) {
    return [{ file: label, status: 'skipped', error: 'เป็นซอร์สโค้ดของเครื่องมือ ไม่ใช่ฐานความรู้งาน ASC', note: `ข้ามโค้ด ${codeCount} ไฟล์ รูปภาพ ${imageCount} ไฟล์` }]
  }
  if (knowledge.length === 0) {
    return [{ file: label, status: 'failed', error: `ไม่พบไฟล์ความรู้ที่นำเข้าได้ (รูปภาพ ${imageCount} ไฟล์ไม่ถูกอ่านเป็นข้อความ)` }]
  }

  const items: ImportItem[] = []
  for (const k of knowledge) {
    try {
      const sub = await importOne(k, depth + 1)
      items.push(...sub)
    } catch (e) {
      items.push({ file: `${f.name} → ${k.name}`, status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (imageCount > 0) {
    items.push({ file: `${label} (รูปภาพ)`, status: 'skipped', error: `ข้ามรูปภาพ ${imageCount} ไฟล์ — ต้องใช้ OCR/vision แล้วจึงนำเข้า`, note: 'รายงานข้อมูลขาด ไม่ถือว่าอ่านสำเร็จ' })
  }
  return items
}

async function importOne(f: ImportFile, depth = 0): Promise<ImportItem[]> {
  const name = f.name.toLowerCase()
  if (name.endsWith('.zip')) {
    if (depth >= 2) return [{ file: f.name, status: 'failed', error: 'ZIP ซ้อนลึกเกินไป' }]
    return importZip(f, depth)
  }
  if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) return [await importTextFile(f)]
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) return [await importTableFile(f)]
  if (name.endsWith('.json')) return importJsonFile(f)
  return [{ file: f.name, status: 'skipped', error: 'ไม่รองรับชนิดไฟล์นี้' }]
}

/** จุดเข้าหลัก: นำเข้าไฟล์หลายไฟล์พร้อมรายงาน */
export async function importFiles(files: ImportFile[]): Promise<ImportResult> {
  const started = Date.now()
  const items: ImportItem[] = []
  for (const f of files) {
    try {
      items.push(...(await importOne(f)))
    } catch (e) {
      items.push({ file: f.name, status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }
  const imported = items.filter((i) => i.status === 'imported').length
  const skipped = items.filter((i) => i.status === 'skipped').length
  const failed = items.filter((i) => i.status === 'failed').length
  return { found: files.length, imported, skipped, failed, items, ms: Date.now() - started }
}
