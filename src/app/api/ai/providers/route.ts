import { getSessionUser } from '@/lib/auth'
import { json, unauthorized } from '@/lib/api'
import { listProviders } from '@/lib/ai/provider'
import type { ProvidersRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/ai/providers — รายชื่อผู้ให้บริการโมเดลและตัวที่ใช้งานอยู่ */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const { providers, activeProvider } = await listProviders()
  return json<ProvidersRes>({ providers, activeProvider })
}
