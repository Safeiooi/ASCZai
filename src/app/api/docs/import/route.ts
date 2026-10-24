import { getSessionUser } from '@/lib/auth'
import { badRequest, forbidden, json, unauthorized } from '@/lib/api'
import { importFiles } from '@/lib/import'
import type { ImportItem, ImportRes } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_FILE_BYTES = 60 * 1024 * 1024

/** POST /api/docs/import — นำเข้าไฟล์ความรู้ (เฉพาะแอดมิน, multipart/form-data field "files") */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('ไม่พบไฟล์ที่จะนำเข้า')
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return badRequest('ไม่พบไฟล์ที่จะนำเข้า')

  const prepared: { name: string; buffer: Buffer }[] = []
  const oversize: ImportItem[] = []
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      oversize.push({
        file: file.name,
        status: 'failed',
        error: `ไฟล์ใหญ่เกิน ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB`,
      })
      continue
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    prepared.push({ name: file.name, buffer })
  }

  const result = await importFiles(prepared)

  const items = [...result.items, ...oversize]
  const imported = items.filter((i) => i.status === 'imported').length
  const skipped = items.filter((i) => i.status === 'skipped').length
  const failed = items.filter((i) => i.status === 'failed').length

  const res: ImportRes = {
    ok: true,
    found: files.length,
    imported,
    skipped,
    failed,
    items,
    ms: result.ms,
  }
  return json(res)
}
