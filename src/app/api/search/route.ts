import { getSessionUser } from '@/lib/auth'
import { badRequest, json, unauthorized } from '@/lib/api'
import { searchKnowledge } from '@/lib/rag'
import type { SearchRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/search?q=&limit= — ค้นหาหลักฐานจากฐานความรู้ */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) return badRequest('กรุณาระบุคำค้นหา')

  const limitRaw = Number(url.searchParams.get('limit') ?? '')
  const limit = Math.min(20, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 8)

  const started = Date.now()
  const results = await searchKnowledge(q, { limit })
  const res: SearchRes = { query: q, results, ms: Date.now() - started }
  return json(res)
}
