import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { json, notFound, unauthorized } from '@/lib/api'
import type { Attachment, ChatMessage, Citation, MessageMeta, SessionDetailRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeParse<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined
  try {
    const v = JSON.parse(raw) as T
    return v ?? undefined
  } catch {
    return undefined
  }
}

/** ตรวจสิทธิ์แล้วคืนเซสชัน (null ถ้าไม่พบ/ไม่ใช่ของผู้ใช้) */
async function ownedSession(id: string, userId: string) {
  return db.chatSession.findFirst({ where: { id, userId } })
}

/** GET /api/chat/sessions/[id] — เนื้อหาบทสนทนาทั้งหมด */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const { id } = await params
  const session = await ownedSession(id, user.id)
  if (!session) return notFound('ไม่พบบทสนทนา')

  const rows = await db.message.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
  })

  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    attachments: safeParse<Attachment[]>(m.attachments),
    citations: safeParse<Citation[]>(m.citations),
    meta: safeParse<MessageMeta>(m.meta),
    createdAt: m.createdAt.toISOString(),
  }))

  const res: SessionDetailRes = {
    session: { id: session.id, title: session.title, provider: session.provider },
    messages,
  }
  return json(res)
}

/** DELETE /api/chat/sessions/[id] — ลบบทสนทนา (ข้อความถูกลบตามด้วย) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const { id } = await params
  const session = await ownedSession(id, user.id)
  if (!session) return notFound('ไม่พบบทสนทนา')

  await db.chatSession.delete({ where: { id: session.id } })
  return json({ ok: true })
}
