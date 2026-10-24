import { db } from '@/lib/db'
import { getSessionUser, hashPassword } from '@/lib/auth'
import { badRequest, forbidden, json, unauthorized } from '@/lib/api'
import type { UserItem, UsersRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** GET /api/admin/users — รายชื่อผู้ใช้พร้อมโควตาวันนี้ (เฉพาะแอดมิน) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
  const [rows, quotas] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: 'asc' } }),
    db.quotaUsage.findMany({ where: { day }, select: { userId: true, count: true } }),
  ])
  const quotaMap = new Map(quotas.map((q) => [q.userId, q.count]))

  const users: UserItem[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === 'admin' ? 'admin' : 'user',
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    quotaUsed: quotaMap.get(u.id) ?? 0,
  }))

  return json<UsersRes>({ users })
}

/** POST /api/admin/users — เพิ่มผู้ใช้ใหม่ (เฉพาะแอดมิน) */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  let body: { email?: unknown; name?: unknown; password?: unknown; role?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return badRequest('รูปแบบคำขอไม่ถูกต้อง')
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : null
  const roleInput = typeof body.role === 'string' ? body.role : 'user'

  if (!email || !password) return badRequest('กรุณากรอกอีเมลและรหัสผ่าน')
  if (!EMAIL_RE.test(email)) return badRequest('รูปแบบอีเมลไม่ถูกต้อง')
  if (password.length < 8) return badRequest('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร')
  if (roleInput !== 'admin' && roleInput !== 'user') return badRequest('สิทธิ์ผู้ใช้ไม่ถูกต้อง')

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) return badRequest('อีเมลนี้ถูกใช้แล้ว')

  const created = await db.user.create({
    data: {
      email,
      name,
      password: hashPassword(password),
      role: roleInput,
      status: 'active',
    },
  })

  const item: UserItem = {
    id: created.id,
    email: created.email,
    name: created.name,
    role: created.role === 'admin' ? 'admin' : 'user',
    status: created.status,
    createdAt: created.createdAt.toISOString(),
    quotaUsed: 0,
  }
  return json<UserItem>(item)
}
