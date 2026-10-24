/**
 * ทบทวนสถานะเอกสารทั้งหมดด้วย heuristic ล่าสุด (เอกสาร ASC ทางการแพทย์ → review รอตรวจสอบ)
 * รัน: bun scripts/recheck-docs.ts
 */

import { db } from '@/lib/db'

const MEDICAL_RE = /(ศัลยกรรม|ผ่าตัด|การระงับความรู้สึก|ambulatory|surgic|outpatient|ผู้ป่วย|โรงพยาบาล|infection control|ห้องคลอด|ทันตกรรม)/i

async function main() {
  const docs = await db.document.findMany({ select: { id: true, title: true, status: true } })
  let toReview = 0
  let toPublish = 0
  for (const d of docs) {
    const medical = MEDICAL_RE.test(d.title)
    const shouldReview = medical
    if (shouldReview && d.status !== 'review') {
      await db.document.update({
        where: { id: d.id },
        data: { status: 'review', note: 'พบสัญญาณว่าเป็นเอกสาร ASC ทางการแพทย์ (ใช้ตัวย่อ ASC เหมือนกัน) — รอผู้ดูแลตรวจสอบก่อนเผยแพร่' },
      })
      toReview += 1
      console.log('→ review:', d.title.slice(0, 80))
    } else if (!shouldReview && d.status === 'review' && !d.title) {
      // ไม่มีกรณีนี้ในทางปฏิบัติ แต่กันไว้
    } else if (!shouldReview && d.status === 'review' && !MEDICAL_RE.test(d.title)) {
      // เอกสารที่เคยถูกตั้ง review จากเนื้อหา URL แต่ชื่อจริงไม่ใช่การแพทย์ → คง review ไว้ให้คนตรวจต่อ (ไม่เผยแพร่อัตโนมัติ)
    }
  }
  const byStatus = await db.document.groupBy({ by: ['status'], _count: true })
  console.log(`\nปรับเป็นรอตรวจสอบ ${toReview} เอกสาร · เผยแพร่อัตโนมัติกลับ 0`)
  console.log('สถานะปัจจุบัน:', JSON.stringify(byStatus))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
