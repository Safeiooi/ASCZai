/**
 * OCR ฟรี: ลอง Tesseract.js (local, tha+eng) ก่อน — ถ้าโหลดข้อมูลภาษาไม่ได้
 * ให้ fallback ไปใช้โมเดล vision (VLM) แบบกำหนด timeout ไม่ให้ค้าง
 */

import { createWorker } from 'tesseract.js'
import { getProvider } from '@/lib/ai/provider'
import type { ImagePart } from '@/lib/ai/provider'

export interface OcrResult {
  ok: boolean
  text: string
  engine: 'tesseract' | 'vlm' | 'none'
  ms: number
}

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('tha+eng').catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

async function tesseractOcr(dataUrl: string, timeoutMs: number): Promise<string> {
  const run = async () => {
    const worker = await getWorker()
    const { data } = await worker.recognize(dataUrl)
    return (data.text ?? '').trim()
  }
  return Promise.race([
    run(),
    new Promise<string>((_, rej) => setTimeout(() => rej(new Error('tesseract timeout')), timeoutMs)),
  ])
}

async function vlmOcr(dataUrl: string, timeoutMs: number): Promise<string> {
  const provider = await getProvider('zai')
  const p = provider as unknown as {
    vision?: (prompt: string, images: ImagePart[], timeoutMs?: number) => Promise<string>
  }
  if (typeof p.vision !== 'function') return ''
  const text = await p.vision(
    'สกัดข้อความทั้งหมดที่ปรากฏในภาพนี้ให้ครบถ้วน ตามลำดับบนลงล่าง ห้ามแต่งเพิ่ม หากไม่มีข้อความให้ตอบว่า (ไม่มีข้อความในภาพ)',
    [{ dataUrl }],
    timeoutMs,
  )
  return text.trim()
}

export async function ocrImage(
  dataUrl: string,
  opts: { preferVLM?: boolean; timeoutMs?: number } = {},
): Promise<OcrResult> {
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? 45_000
  const tryOrder = opts.preferVLM === false ? (['tesseract', 'vlm'] as const) : (['vlm', 'tesseract'] as const)
  let lastErr: unknown = null
  for (const engine of tryOrder) {
    try {
      const text = engine === 'tesseract' ? await tesseractOcr(dataUrl, timeoutMs) : await vlmOcr(dataUrl, timeoutMs)
      if (text) return { ok: true, text, engine, ms: Date.now() - started }
      lastErr = new Error('ว่าง')
    } catch (e) {
      lastErr = e
    }
  }
  return {
    ok: false,
    text: '',
    engine: 'none',
    ms: Date.now() - started,
  }
}
