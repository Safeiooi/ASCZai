import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { json, unauthorized } from '@/lib/api'
import type { DocListItem, DocsRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/docs — รายการเอกสารทั้งหมดในคลังความรู้ */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const rows = await db.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { _count: { select: { chunks: true } } },
  })

  const docs: DocListItem[] = rows.map((d) => ({
    id: d.id,
    title: d.title,
    source: d.source,
    sourceType: d.sourceType,
    category: d.category,
    status: d.status,
    note: d.note,
    version: d.version,
    size: d.size,
    chunkCount: d._count.chunks,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }))

  return json<DocsRes>({ docs })
}
