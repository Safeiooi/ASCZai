import path from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { notFound, unauthorized } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/** GET /api/chat/images/[filename] — เสิร์ฟรูปที่แนบในแชท (ต้องล็อกอิน) */
export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const { filename } = await params
  const base = path.basename(filename)
  if (!/^[A-Za-z0-9._-]+$/.test(base) || base.startsWith('.')) {
    return notFound('ไม่พบไฟล์รูปภาพ')
  }

  const ext = base.split('.').pop()?.toLowerCase() ?? ''
  const mime = MIME_BY_EXT[ext]
  if (!mime) return notFound('ไม่รองรับชนิดไฟล์นี้')

  const filePath = path.join(process.cwd(), 'upload', 'chat-images', base)
  try {
    const st = await stat(filePath)
    if (!st.isFile()) return notFound('ไม่พบไฟล์รูปภาพ')
    const data = await readFile(filePath)
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(st.size),
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch {
    return notFound('ไม่พบไฟล์รูปภาพ')
  }
}
