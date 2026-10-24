import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { json } from '@/lib/api'
import { getAIConfig } from '@/lib/settings'
import type { BootRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/boot — ข้อมูลเริ่มต้นของหน้า (เรียกบ่อยมาก ต้องเบาและเร็ว) */
export async function GET() {
  const [user, ai] = await Promise.all([getSessionUser(), getAIConfig()])

  if (!user) {
    return json<BootRes>({
      user: null,
      aiEnabled: ai.enabled,
      quota: { used: 0, limit: ai.dailyQuota },
    })
  }

  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
  const usage = await db.quotaUsage.findUnique({
    where: { userId_day: { userId: user.id, day } },
    select: { count: true },
  })

  return json<BootRes>({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    aiEnabled: ai.enabled,
    quota: { used: usage?.count ?? 0, limit: ai.dailyQuota },
  })
}
