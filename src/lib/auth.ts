import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/' },
  providers: [
    Credentials({
      name: 'ASC Hub',
      credentials: {
        email: { label: 'อีเมล', type: 'text' },
        password: { label: 'รหัสผ่าน', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password
        if (!email || !password) return null
        const user = await db.user.findUnique({ where: { email } })
        if (!user || user.status !== 'active') return null
        if (!verifyPassword(password, user.password)) return null
        return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { id?: string; role?: string }
        token.uid = u.id
        token.role = u.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        ;(session.user as { id?: string }).id = token.uid as string
        ;(session.user as { role?: string }).role = token.role as string
      }
      return session
    },
  },
}

/** อ่านผู้ใช้ปัจจุบันจาก session (ตรวจ DB ทุกครั้ง เพื่อให้สิทธิ์/สถานะเป็นจริงเสมอ) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { getServerSession } = await import('next-auth')
  const session = await getServerSession(authOptions)
  const id = session?.user ? (session.user as { id?: string }).id : undefined
  if (!id) return null
  const dbUser = await db.user.findUnique({ where: { id } })
  if (!dbUser || dbUser.status !== 'active') return null
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? dbUser.email,
    role: dbUser.role === 'admin' ? 'admin' : 'user',
  }
}
