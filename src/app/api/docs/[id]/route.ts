import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { badRequest, forbidden, json, notFound, unauthorized } from '@/lib/api'
import type { DocListItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC_STATUSES = ['published', 'review', 'error'] as const

function toDocListItem(d: {
  id: string
  title: string
  source: string | null
  sourceType: string
  category: string
  status: string
  note: string | null
  version: number
  size: number
  createdAt: Date
  updatedAt: Date
}, chunkCount: number): DocListItem {
  return {
    id: d.id,
    title: d.title,
    source: d.source,
    sourceType: d.sourceType,
    category: d.category,
    status: d.status,
    note: d.note,
    version: d.version,
    size: d.size,
    chunkCount,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

/** GET /api/docs/[id] — รายละเอียดเอกสารพร้อมชิ้นเนื้อหา (สูงสุด 200 ชิ้นแรก) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const { id } = await params
  const doc = await db.document.findUnique({
    where: { id },
    include: { _count: { select: { chunks: true } } },
  })
  if (!doc) return notFound('ไม่พบเอกสาร')

  const chunks = await db.chunk.findMany({
    where: { documentId: doc.id },
    orderBy: { idx: 'asc' },
    take: 200,
    select: { idx: true, heading: true, content: true },
  })

  return json({
    doc: toDocListItem(doc, doc._count.chunks),
    chunks: chunks.map((c) => ({ idx: c.idx, heading: c.heading, content: c.content.slice(0, 1200) })),
  })
}

/** PATCH /api/docs/[id] — แก้ชื่อ/หมวด/สถานะ (เฉพาะแอดมิน) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const { id } = await params
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) return notFound('ไม่พบเอกสาร')

  let body: { title?: unknown; category?: unknown; status?: unknown }
  try {
    body = (await req.json()) as { title?: unknown; category?: unknown; status?: unknown }
  } catch {
    return badRequest('รูปแบบคำขอไม่ถูกต้อง')
  }

  const data: { title?: string; category?: string; status?: string } = {}
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return badRequest('ชื่อเอกสารไม่ถูกต้อง')
    data.title = title.slice(0, 200)
  }
  if (body.category !== undefined) {
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    if (!category) return badRequest('หมวดหมู่ไม่ถูกต้อง')
    data.category = category.slice(0, 60)
  }
  if (body.status !== undefined) {
    const status = typeof body.status === 'string' ? body.status : ''
    if (!(DOC_STATUSES as readonly string[]).includes(status)) {
      return badRequest('สถานะเอกสารไม่ถูกต้อง (published | review | error)')
    }
    data.status = status
  }
  if (Object.keys(data).length === 0) return badRequest('ไม่มีข้อมูลให้แก้ไข')

  const updated = await db.document.update({
    where: { id: doc.id },
    data,
    include: { _count: { select: { chunks: true } } },
  })

  return json(toDocListItem(updated, updated._count.chunks))
}

/** DELETE /api/docs/[id] — ลบเอกสาร (ชิ้นเนื้อหาถูกลบตาม) เฉพาะแอดมิน */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const { id } = await params
  const doc = await db.document.findUnique({ where: { id }, select: { id: true } })
  if (!doc) return notFound('ไม่พบเอกสาร')

  await db.document.delete({ where: { id: doc.id } })
  return json({ ok: true })
}
