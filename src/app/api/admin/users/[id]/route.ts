import { db } from '@/lib/db'
import { getSessionUser, hashPassword } from '@/lib/auth'
import { badRequest, forbidden, json, notFound, unauthorized } from '@/lib/api'
import type { UserItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PATCH /api/admin/users/[id] — แก้ชื่อ/สิทธิ์/สถานะ/รหัสผ่าน (เฉพาะแอดมิน) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const { id } = await params
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return notFound('ไม่พบผู้ใช้')

  let body: { name?: unknown; role?: unknown; status?: unknown; password?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return badRequest('รูปแบบคำขอไม่ถูกต้อง')
  }

  const touchesRoleOrStatus = body.role !== undefined || body.status !== undefined
  if (user.id === id && touchesRoleOrStatus) {
    return badRequest('ไม่สามารถแก้สิทธิ์หรือสถานะของบัญชีตัวเองได้')
  }

  const data: { name?: string | null; role?: string; status?: string; password?: string } = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return badRequest('ชื่อไม่ถูกต้อง')
    data.name = body.name.trim().slice(0, 120)
  }
  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'user') return badRequest('สิทธิ์ผู้ใช้ไม่ถูกต้อง')
    data.role = body.role
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') return badRequest('สถานะผู้ใช้ไม่ถูกต้อง')
    data.status = body.status
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 8) {
      return badRequest('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร')
    }
    data.password = hashPassword(body.password)
  }
  if (Object.keys(data).length === 0) return badRequest('ไม่มีข้อมูลให้แก้ไข')

  const updated = await db.user.update({ where: { id: target.id }, data })

  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
  const usage = await db.quotaUsage.findUnique({
    where: { userId_day: { userId: updated.id, day } },
    select: { count: true },
  })

  const item: UserItem = {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role === 'admin' ? 'admin' : 'user',
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    quotaUsed: usage?.count ?? 0,
  }
  return json<UserItem>(item)
}

/** DELETE /api/admin/users/[id] — ลบผู้ใช้ (เฉพาะแอดมิน) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const { id } = await params
  if (user.id === id) return badRequest('ไม่สามารถลบบัญชีตัวเองได้')

  const target = await db.user.findUnique({ where: { id } })
  if (!target) return notFound('ไม่พบผู้ใช้')

  if (target.role === 'admin') {
    const adminCount = await db.user.count({ where: { role: 'admin' } })
    if (adminCount <= 1) return badRequest('ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน')
  }

  await db.user.delete({ where: { id: target.id } })
  return json({ ok: true })
}
