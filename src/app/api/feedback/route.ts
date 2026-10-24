import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { badRequest, json, unauthorized } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/feedback — บันทึกฟีดแบ็ก ถูก/ไม่ถูกใจ ต่อข้อความคำตอบ */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  let body: { messageId?: unknown; rating?: unknown; comment?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return badRequest('รูปแบบคำขอไม่ถูกต้อง')
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : ''
  const rating = typeof body.rating === 'string' ? body.rating : ''
  if (!messageId) return badRequest('ไม่พบข้อความที่ต้องการให้ฟีดแบ็ก')
  if (rating !== 'up' && rating !== 'down') return badRequest('ค่าฟีดแบ็กไม่ถูกต้อง')

  const comment = typeof body.comment === 'string' && body.comment.trim()
    ? body.comment.trim().slice(0, 2000)
    : null

  await db.feedback.create({
    data: { userId: user.id, messageId, rating, comment },
  })

  return json({ ok: true })
}
