import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { json, unauthorized } from '@/lib/api'
import type { ChatSessionItem, SessionsRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/chat/sessions — รายการบทสนทนาของผู้ใช้ปัจจุบัน */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const rows = await db.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { _count: { select: { messages: true } } },
  })

  const sessions: ChatSessionItem[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt.toISOString(),
    messageCount: s._count.messages,
  }))

  return json<SessionsRes>({ sessions })
}
