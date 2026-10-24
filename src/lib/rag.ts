/**
 * RAG แบบเบา (ไม่ต้องมี vector DB): แบ่งชิ้น → จัดดัชนีใน SQLite → ค้นแบบคะแนนในหน่วยความจำ
 * เป้าหมายความเร็ว: ผลค้นหาทั่วไป < 2 วินาที (วัดจริงทุกครั้งและส่ง ms กลับ)
 */

import { db } from '@/lib/db'
import type { Citation } from '@/lib/types'

export interface ChunkDraft {
  idx: number
  heading: string | null
  content: string
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g

export function normalizeText(s: string): string {
  return s.replace(ZERO_WIDTH, '').replace(/\r\n?/g, '\n').toLowerCase()
}

/** แบ่งเนื้อหาเป็นชิ้น โดยเก็บหัวข้อ (heading) ปัจจุบันไว้เป็นบริบท */
export function chunkMarkdown(content: string, maxLen = 850): ChunkDraft[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const chunks: ChunkDraft[] = []
  let heading: string | null = null
  let buf: string[] = []
  let len = 0

  const flush = () => {
    const text = buf.join('\n').trim()
    if (text.length >= 12) {
      chunks.push({ idx: chunks.length, heading, content: heading ? `【${heading}】\n${text}` : text })
    }
    buf = []
    len = 0
  }

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (h) {
      flush()
      heading = h[2].trim().slice(0, 120)
    }
    const lineLen = line.length + 1
    if (len + lineLen > maxLen && len > 0) flush()
    buf.push(line)
    len += lineLen
  }
  flush()
  return chunks
}

/** แบ่งเนื้อหาแบบตาราง (CSV/XLSX) เป็นกลุ่มแถว พร้อมหัวคอลัมน์กำกับทุกชิ้น */
export function chunkTable(header: string[], rows: string[][], rowsPerChunk = 40): ChunkDraft[] {
  const chunks: ChunkDraft[] = []
  const colHeader = header.map((h, i) => h || `คอลัมน์${i + 1}`).join(' | ')
  const clean = rows.filter((r) => r.some((c) => (c ?? '').trim().length > 0))
  for (let i = 0; i < clean.length; i += rowsPerChunk) {
    const part = clean.slice(i, i + rowsPerChunk).map((r) => r.map((c) => (c ?? '').trim()).join(' | '))
    const content = `หัวคอลัมน์: ${colHeader}\nแถว ${i + 1}-${i + part.length}\n${part.join('\n')}`
    chunks.push({ idx: chunks.length, heading: `แถว ${i + 1}-${i + part.length}`, content })
  }
  return chunks
}

/** ตัดคำค้น: วลีเต็ม + คำแยก + shingle สำหรับภาษาไทยติดกันยาว ๆ */
export function extractTerms(query: string): { phrase: string; words: string[]; shingles: string[] } {
  const norm = normalizeText(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  const words = norm.split(' ').filter((w) => w.length >= 2).slice(0, 12)
  const shingles: string[] = []
  for (const w of words) {
    if (/[\u0E00-\u0E7F]/.test(w) && w.length > 6) {
      for (let i = 0; i + 4 <= w.length && shingles.length < 10; i += 2) {
        shingles.push(w.slice(i, i + 4))
      }
    }
  }
  return { phrase: norm, words, shingles }
}

function snippetAround(content: string, terms: string[], size = 260): string {
  const flat = content.replace(/\n+/g, ' ')
  for (const t of terms) {
    const at = flat.toLowerCase().indexOf(t)
    if (at >= 0) {
      const start = Math.max(0, at - 80)
      return (start > 0 ? '…' : '') + flat.slice(start, start + size) + (start + size < flat.length ? '…' : '')
    }
  }
  return flat.slice(0, size) + (flat.length > size ? '…' : '')
}

export interface SearchOptions {
  limit?: number
  includeReview?: boolean
}

/** ค้นหาหลักฐานจากฐานความรู้ (เฉพาะเอกสารสถานะ published เท่านั้น) */
export async function searchKnowledge(query: string, opts: SearchOptions = {}): Promise<Citation[]> {
  const limit = Math.max(1, Math.min(20, opts.limit ?? 6))
  const { phrase, words, shingles } = extractTerms(query)
  if (!phrase) return []

  const likeTerms = [...words.slice(0, 8), ...shingles.slice(0, 6)]
  if (likeTerms.length === 0) likeTerms.push(phrase)
  const esc = likeTerms.map((t) => t.replace(/[%_\\]/g, '\\$&'))
  const where = esc.map(() => `(c.content LIKE ? ESCAPE '\\' OR c.heading LIKE ? ESCAPE '\\')`).join(' OR ')
  const params = esc.flatMap((t) => [`%${t}%`, `%${t}%`])

  const started = Date.now()
  const rows = await db.$queryRawUnsafe<Array<{
    id: string; content: string; heading: string | null; documentId: string
    docTitle: string; source: string | null; updatedAt: Date; category: string
  }>>(
    `SELECT c.id, c.content, c.heading, c.documentId, d.title AS docTitle, d.source, d.updatedAt, d.category
     FROM Chunk c JOIN Document d ON d.id = c.documentId
     WHERE d.status = 'published'${opts.includeReview ? '' : ` AND d.status = 'published'`} AND (${where})
     LIMIT 600`,
    ...params,
  )
  void started

  const scored = rows.map((r) => {
    const c = normalizeText(r.content)
    const h = r.heading ? normalizeText(r.heading) : ''
    let score = 0
    if (phrase.length >= 4 && c.includes(phrase)) score += 60
    if (phrase.length >= 4 && h.includes(phrase)) score += 20
    for (const w of words) {
      if (h.includes(w)) score += 22
      const hits = Math.min(6, c.split(w).length - 1)
      score += hits * 7
    }
    for (const s of shingles) {
      if (c.includes(s)) score += 2
    }
    if (r.category === 'manual' || r.category === 'product') score += 2
    const ageDays = (Date.now() - new Date(r.updatedAt).getTime()) / 86_400_000
    score += Math.max(0, 4 - Math.min(4, ageDays / 30))
    return { row: r, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.filter((s) => s.score > 0).slice(0, limit)
  const wordsForSnippet = [...words, ...shingles]
  return top.map(({ row, score }) => ({
    id: row.id,
    documentId: row.documentId,
    docTitle: row.docTitle,
    heading: row.heading,
    snippet: snippetAround(row.content, wordsForSnippet),
    source: row.source,
    score: Math.round(score * 10) / 10,
    level: 'confirmed' as const,
  }))
}
