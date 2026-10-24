import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { forbidden, json, unauthorized } from '@/lib/api'
import type { AdminOverviewRes, FeedbackItem, StatsRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/stats — ภาพรวมสถิติ + ฟีดแบ็กล่าสุด (เฉพาะแอดมิน) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })

  const [
    docs,
    chunks,
    publishedDocs,
    reviewDocs,
    errorDocs,
    users,
    sessions,
    messages,
    todayAgg,
    feedbackUp,
    feedbackDown,
    feedbackRows,
  ] = await Promise.all([
    db.document.count(),
    db.chunk.count(),
    db.document.count({ where: { status: 'published' } }),
    db.document.count({ where: { status: 'review' } }),
    db.document.count({ where: { status: 'error' } }),
    db.user.count(),
    db.chatSession.count(),
    db.message.count(),
    db.quotaUsage.aggregate({ _sum: { count: true }, where: { day } }),
    db.feedback.count({ where: { rating: 'up' } }),
    db.feedback.count({ where: { rating: 'down' } }),
    db.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, email: true } } },
    }),
  ])

  // เนื้อหาข้อความที่ถูกฟีดแบ็ก (ถ้ายังไม่ถูกลบ)
  const messageIds = [
    ...new Set(feedbackRows.map((f) => f.messageId).filter((x): x is string => Boolean(x))),
  ]
  const msgs = messageIds.length
    ? await db.message.findMany({ where: { id: { in: messageIds } }, select: { id: true, content: true } })
    : []
  const contentById = new Map(msgs.map((m) => [m.id, m.content]))

  const feedbacks: FeedbackItem[] = feedbackRows.map((f) => ({
    id: f.id,
    userName: f.user?.name ?? f.user?.email ?? 'ผู้ใช้',
    rating: f.rating,
    comment: f.comment,
    messageContent: f.messageId ? (contentById.get(f.messageId) ?? null) : null,
    createdAt: f.createdAt.toISOString(),
  }))

  const stats: StatsRes = {
    docs,
    chunks,
    publishedDocs,
    reviewDocs,
    errorDocs,
    users,
    sessions,
    messages,
    todayQueries: todayAgg._sum.count ?? 0,
    feedbackUp,
    feedbackDown,
  }

  const res: AdminOverviewRes = { stats, feedbacks }
  return json(res)
}
