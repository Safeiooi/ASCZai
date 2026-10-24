/**
 * สคริปต์นำเข้าคลังความรู้จริงจากไฟล์ใน upload/
 * รัน: bun scripts/import-corpus.ts [ไฟล์1 ไฟล์2 ...]
 * ไม่ระบุไฟล์ = นำเข้า ZIP ความรู้ทั้งหมดที่พบใน upload/ (ตัด pasted_image / chat-images ออก)
 */

import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { importFiles } from '@/lib/import'
import { db } from '@/lib/db'

async function main() {
  const args = process.argv.slice(2)
  let paths: string[] = args
  if (paths.length === 0) {
    const uploadDir = join(process.cwd(), 'upload')
    const entries = await readdir(uploadDir)
    paths = entries
      .filter((f) => f.toLowerCase().endsWith('.zip'))
      .map((f) => join(uploadDir, f))
  }
  if (paths.length === 0) {
    console.log('ไม่พบไฟล์ที่จะนำเข้า')
    return
  }
  const files = paths.map((p) => ({ name: p.split('/').pop() ?? p, buffer: readFileSync(p) as unknown as Buffer }))
  console.log(`เริ่มนำเข้า ${files.length} ไฟล์: ${files.map((f) => f.name).join(', ')}`)
  const result = await importFiles(files)
  console.log(`\nสรุป: พบ ${result.found} · นำเข้า ${result.imported} · ข้าม ${result.skipped} · ล้มเหลว ${result.failed} · ${result.ms} ms`)
  for (const item of result.items) {
    const mark = item.status === 'imported' ? '✔' : item.status === 'skipped' ? '–' : '✖'
    console.log(`${mark} ${item.file} [${item.status}]${item.chunks ? ` (${item.chunks} chunks)` : ''}${item.error ? ` — ${item.error}` : ''}${item.note ? ` — ${item.note}` : ''}`)
  }
  const [docs, chunks] = await Promise.all([db.document.count(), db.chunk.count()])
  console.log(`\nฐานความรู้ตอนนี้: เอกสาร ${docs} · ชิ้นความรู้ ${chunks}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
