import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { badRequest, unauthorized } from '@/lib/api'
import { getAIConfig } from '@/lib/settings'
import { allowPerMinute, getProvider } from '@/lib/ai/provider'
import type { ChatMessageInput, ImagePart } from '@/lib/ai/provider'
import { ocrImage } from '@/lib/ai/ocr'
import { searchKnowledge } from '@/lib/rag'
import { ASC_SYSTEM_PROMPT, buildEvidenceBlock } from '@/lib/ai/system-prompt'
import type { AskSseEvent, Attachment, Citation, MessageMeta } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AskImage {
  dataUrl?: string
  name?: string
  mimeType?: string
}

interface AskBody {
  sessionId?: string
  question?: string
  provider?: string
  ocrMode?: boolean
  images?: AskImage[]
}

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const CHAT_IMAGES_DIR = path.join(process.cwd(), 'upload', 'chat-images')

/** คำตอบสำรองเมื่อไม่ได้เรียกโมเดล — แสดงหลักฐานจากฐานความรู้ตรง ๆ */
function buildSearchOnlyFallback(citations: Citation[]): string {
  if (citations.length === 0) {
    return 'ไม่พบหลักฐานในฐานความรู้สำหรับคำถามนี้ ลองใช้คำสำคัญอื่น หรือนำเข้าเอกสารที่เกี่ยวข้องก่อน'
  }
  const lines = citations.map(
    (c, i) => `**[${i + 1}] ${c.docTitle}**${c.heading ? ` — ${c.heading}` : ''}\n> ${c.snippet}`,
  )
  return `ฐานความรู้พบสิ่งที่เกี่ยวข้องต่อไปนี้ (โหมดค้นหา — ยังไม่ได้สรุปด้วย AI):\n\n${lines.join('\n\n')}`
}

/** POST /api/chat/ask — รับคำถาม (+รูปภาพ) แล้วส่งคำตอบแบบ SSE ทีละชิ้น */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  let body: AskBody
  try {
    body = (await req.json()) as AskBody
  } catch {
    return badRequest('รูปแบบคำขอไม่ถูกต้อง')
  }

  // ติดตามการยกเลิกจากฝั่งผู้ใช้ (กดหยุด / ปิดหน้า)
  let aborted = false
  const onAbort = () => {
    aborted = true
  }
  req.signal.addEventListener('abort', onAbort, { once: true })

  const tStart = Date.now()
  let sessionId: string | null = null
  let userMessageId: string | null = null
  let providerId: string | undefined
  let assistantSaved = false
  let full = ''
  let citations: Citation[] = []
  let ocrEngine: MessageMeta['ocrEngine']
  let ocrMs: number | undefined
  let searchMs: number | undefined
  let modelMs: number | undefined
  let warning: string | undefined
  let searchOnly = false

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: AskSseEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }

      try {
        /* ---------- a. ตรวจความถูกต้องของคำขอ ---------- */
        const question = typeof body.question === 'string' ? body.question.trim() : ''
        const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES + 1) : []
        const ocrMode = body.ocrMode === true

        if (!question && images.length === 0) {
          send({ type: 'error', message: 'กรุณาพิมพ์คำถามหรือแนบรูปภาพอย่างน้อย 1 รูป' })
          return
        }
        if (images.length > MAX_IMAGES) {
          send({ type: 'error', message: `แนบรูปภาพได้สูงสุด ${MAX_IMAGES} รูปต่อคำถาม` })
          return
        }
        for (const img of images) {
          if (!img || typeof img.dataUrl !== 'string' || !DATA_URL_RE.test(img.dataUrl)) {
            send({ type: 'error', message: 'รูปภาพไม่ถูกต้อง (รองรับ PNG/JPEG/WEBP/GIF เท่านั้น)' })
            return
          }
          const b64 = img.dataUrl.slice(img.dataUrl.indexOf(',') + 1)
          const decodedBytes = Math.floor((b64.length * 3) / 4)
          if (decodedBytes > MAX_IMAGE_BYTES) {
            send({ type: 'error', message: 'รูปภาพมีขนาดเกิน 5MB กรุณาย่อหรือเลือกรูปใหม่' })
            return
          }
        }

        /* ---------- b. จำกัดความถี่ ---------- */
        if (!allowPerMinute(user.id, 20)) {
          send({ type: 'error', message: 'ส่งคำถามถี่เกินไป ลองอีกครั้งในอีกสักครู่' })
          return
        }

        /* ---------- c. โควตา + ตั้งค่า AI ---------- */
        const ai = await getAIConfig()
        const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
        const usage = await db.quotaUsage.findUnique({
          where: { userId_day: { userId: user.id, day } },
          select: { count: true },
        })
        const used = usage?.count ?? 0
        if (ai.enabled && used >= ai.dailyQuota) {
          send({
            type: 'error',
            message: `โควต้าคำถามวันนี้ครบแล้ว (${used} คำถาม) กลับมาใช้ใหม่พรุ่งนี้`,
          })
          return
        }

        /* ---------- d. เซสชัน ---------- */
        let session: { id: string } | null = null
        if (body.sessionId) {
          session = await db.chatSession.findFirst({
            where: { id: body.sessionId, userId: user.id },
          })
          if (!session) {
            send({ type: 'error', message: 'ไม่พบบทสนทนาที่ระบุ' })
            return
          }
        } else {
          session = await db.chatSession.create({
            data: {
              userId: user.id,
              title: (question || 'ถามพร้อมรูปภาพ').slice(0, 60),
            },
          })
        }
        sessionId = session.id

        const provider = await getProvider(body.provider)
        providerId = provider.id

        /* ---------- e. บันทึกไฟล์รูป ---------- */
        const attachments: Attachment[] = []
        if (images.length > 0) {
          await mkdir(CHAT_IMAGES_DIR, { recursive: true })
          for (let i = 0; i < images.length; i++) {
            const img = images[i] as AskImage
            const dataUrl = img.dataUrl as string
            const m = DATA_URL_RE.exec(dataUrl)
            const extRaw = m?.[1] ?? 'png'
            const mime = img.mimeType && /^image\/(png|jpeg|jpg|webp|gif)$/.test(img.mimeType)
              ? img.mimeType
              : `image/${extRaw === 'jpg' ? 'jpeg' : extRaw}`
            const filename = `msg-${Date.now()}-${i}.${extRaw}`
            const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
            await writeFile(path.join(CHAT_IMAGES_DIR, filename), buf)
            attachments.push({
              name: typeof img.name === 'string' && img.name ? img.name : filename,
              path: `/api/chat/images/${filename}`,
              mime,
              size: buf.length,
            })
          }
        }

        /* ---------- f. บันทึกข้อความผู้ใช้ ---------- */
        const userMessage = await db.message.create({
          data: {
            sessionId: session.id,
            role: 'user',
            content: question,
            attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
          },
        })
        userMessageId = userMessage.id

        /* ---------- h. เริ่มส่งผลลัพธ์ ---------- */
        send({ type: 'started', sessionId: session.id, userMessageId: userMessage.id, userAttachments: attachments })

        /* ---------- i. ทาง OCR (อ่านข้อความจากภาพก่อน — เร็วกว่า VLM) ---------- */
        let ocrText = ''
        if (images.length > 0 && (ocrMode || provider.supportsVision === false)) {
          const tOcr = Date.now()
          const texts: string[] = []
          let okEngine: MessageMeta['ocrEngine'] = 'none'
          for (let i = 0; i < images.length; i++) {
            if (aborted) break
            send({
              type: 'status',
              stage: 'ocr',
              message:
                images.length > 1
                  ? `กำลังอ่านข้อความจากภาพ (${i + 1}/${images.length})…`
                  : 'กำลังอ่านข้อความจากภาพ…',
            })
            const r = await ocrImage((images[i] as AskImage).dataUrl as string, {
              preferVLM: true,
              timeoutMs: 45000,
            })
            if (r.ok && r.text) {
              const name = (images[i] as AskImage).name
              texts.push(`[ภาพที่ ${i + 1}${name ? `: ${name}` : ''}]\n${r.text}`)
              if (r.engine !== 'none') okEngine = r.engine
            }
          }
          ocrMs = Date.now() - tOcr
          if (texts.length > 0) {
            ocrEngine = okEngine
            ocrText = texts.join('\n\n')
          } else {
            ocrEngine = 'none'
            warning = 'อ่านข้อความจากภาพไม่สำเร็จ จะใช้รูปส่งตรงถ้าโมเดลรองรับ'
            send({ type: 'warning', message: warning })
          }
        }
        if (aborted) return

        /* ---------- k. ค้นฐานความรู้ ---------- */
        const searchQuery = question || ocrText.replace(/\s+/g, ' ').trim().slice(0, 200)
        if (searchQuery) {
          send({ type: 'status', stage: 'search', message: 'กำลังค้นฐานความรู้…' })
          const t0 = Date.now()
          citations = await searchKnowledge(searchQuery, { limit: ai.contextChunks })
          searchMs = Date.now() - t0
        }
        send({
          type: 'citations',
          citations,
          ocrEngine,
          ocrMs,
          hasImages: images.length > 0,
          searchMs,
        })
        if (aborted) return

        /* ---------- l. ประกอบข้อความสำหรับโมเดล ---------- */
        const priorRows = await db.message.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true },
        })
        const history: ChatMessageInput[] = priorRows
          .filter((m) => m.id !== userMessage.id && (m.role === 'user' || m.role === 'assistant'))
          .slice(-12)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        const useVision = images.length > 0 && provider.supportsVision && !ocrMode
        const imageParts: ImagePart[] | undefined = useVision
          ? images.map((img) => ({
              dataUrl: (img as AskImage).dataUrl as string,
              mimeType: (img as AskImage).mimeType,
              name: (img as AskImage).name,
            }))
          : undefined

        const finalContent =
          question + (ocrText ? `\n\n[ข้อความที่อ่านได้จากภาพ]\n${ocrText}` : '')

        const messages: ChatMessageInput[] = [
          { role: 'system', content: `${ASC_SYSTEM_PROMPT}\n\n${buildEvidenceBlock(citations)}` },
          ...history,
          { role: 'user', content: finalContent, images: imageParts },
        ]

        /* ---------- m. เรียกโมเดล (หรือโหมดค้นหาอย่างเดียว) ---------- */
        if (!ai.enabled) {
          const warn = 'AI ปิดใช้งานอยู่ — แสดงผลโหมดค้นหา'
          send({ type: 'warning', message: warn })
          warning = warning ? `${warning} | ${warn}` : warn
          searchOnly = true
          full = buildSearchOnlyFallback(citations)
        } else if (!aborted) {
          const t1 = Date.now()
          let lastErr = ''
          try {
            for await (const delta of provider.completeStream({ messages, timeoutMs: ai.timeoutMs })) {
              if (aborted) break
              if (delta) {
                full += delta
                send({ type: 'delta', text: delta })
              }
            }
          } catch (e) {
            /* stream ล้มเหลว — ลองแบบรอครั้งเดียวด้านล่าง */
            lastErr = e instanceof Error ? e.message : String(e)
          }
          if (!full.trim() && !aborted) {
            try {
              const once = await provider.complete({ messages, timeoutMs: ai.timeoutMs })
              if (once.trim()) {
                full = once
                send({ type: 'delta', text: once })
              }
            } catch (e) {
              lastErr = e instanceof Error ? e.message : String(e)
            }
          }
          modelMs = Date.now() - t1
          if (!full.trim()) {
            const detail = lastErr ? ` (${lastErr.slice(0, 140)})` : ''
            const warn = `เรียกโมเดลไม่สำเร็จ — แสดงผลโหมดค้นหาแทน${detail}`
            send({ type: 'warning', message: warn })
            warning = warning ? `${warning} | ${warn}` : warn
            searchOnly = true
            full = buildSearchOnlyFallback(citations)
          }
        }

        /* ---------- o. บันทึกคำตอบ ---------- */
        const meta: MessageMeta = {
          provider: provider.id,
          ocrEngine,
          ocrMs,
          searchMs,
          modelMs,
          totalMs: Date.now() - tStart,
        }
        if (warning) meta.warning = warning
        if (searchOnly) meta.searchOnly = true

        const assistantMessage = await db.message.create({
          data: {
            sessionId: session.id,
            role: 'assistant',
            content: full,
            citations: citations.length > 0 ? JSON.stringify(citations) : null,
            meta: JSON.stringify(meta),
          },
        })
        assistantSaved = true

        /* ---------- p. เพิ่มโควตา ---------- */
        await db.quotaUsage.upsert({
          where: { userId_day: { userId: user.id, day } },
          update: { count: { increment: 1 } },
          create: { userId: user.id, day, count: 1 },
        })

        /* ---------- q. จบ ---------- */
        send({ type: 'done', messageId: assistantMessage.id, meta })
      } catch (e) {
        send({
          type: 'error',
          message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการประมวลผลคำถาม',
        })
      } finally {
        /* ---------- r. ถ้าถูกยกเลิกกลางทาง ให้เก็บเนื้อหาที่ได้มาแล้วแบบเต็มที่ ---------- */
        if (!assistantSaved && sessionId && userMessageId && full.trim()) {
          try {
            const meta: MessageMeta = {
              provider: providerId,
              totalMs: Date.now() - tStart,
            }
            const saved = await db.message.findFirst({
              where: { sessionId: sessionId as string, role: 'assistant', content: full },
              select: { id: true },
            })
            if (!saved) {
              if (warning) meta.warning = warning
              meta.searchOnly = searchOnly
              await db.message.create({
                data: {
                  sessionId: sessionId as string,
                  role: 'assistant',
                  content: full,
                  citations: citations.length > 0 ? JSON.stringify(citations) : null,
                  meta: JSON.stringify(meta),
                },
              })
            }
          } catch {
            /* best effort เท่านั้น */
          }
        }
        try {
          controller.close()
        } catch {
          /* ปิดไปแล้ว */
        }
      }
    },
    cancel() {
      aborted = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
