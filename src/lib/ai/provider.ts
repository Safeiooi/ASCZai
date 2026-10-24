/**
 * ชั้นเรียกโมเดล (provider layer) — เปลี่ยน provider/model ได้จากการตั้งค่าฝั่ง server
 * ผู้ให้บริการในตัว: zai (z-ai-web-dev-sdk ที่ runtime ของ Z.ai), openai (OpenAI-Compatible), ollama (local)
 */

import type {
  AiConfig,
  OllamaConfig,
  OpenAICompatConfig,
  ProviderConfig,
  ProviderInfo,
} from '@/lib/types'
import { getAIConfig, getProviderConfig } from '@/lib/settings'
import type { CreateChatCompletionVisionBody, VisionMultimodalContentItem } from 'z-ai-web-dev-sdk'

export interface ImagePart {
  dataUrl: string
  mimeType?: string
  name?: string
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: ImagePart[]
}

export interface CompleteOptions {
  messages: ChatMessageInput[]
  timeoutMs?: number
  temperature?: number
}

export interface ChatProvider {
  id: string
  label: string
  supportsVision: boolean
  supportsStream: boolean
  available: boolean
  /** ตอบแบบ stream — คืน async iterator ของข้อความบางส่วน */
  completeStream(opts: CompleteOptions): AsyncGenerator<string>
  /** ตอบครั้งเดียวจบ */
  complete(opts: CompleteOptions): Promise<string>
}

function mergeImages(content: string, images?: ImagePart[]): unknown {
  if (!images || images.length === 0) return content
  return [
    { type: 'text', text: content },
    ...images.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl } })),
  ]
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} ใช้เวลานานเกินกว่า ${Math.round(ms / 1000)} วินาที`)), ms)),
  ])
}

/* ---------------- ZAI (z-ai-web-dev-sdk) ---------------- */

class ZAIProvider implements ChatProvider {
  id = 'zai'
  label = 'ZAI (GLM)'
  supportsVision = true
  supportsStream = true
  available = true

  private async client() {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    return ZAI.create()
  }

  /** SDK ของ zai ไม่รับ role 'system' — ใช้ 'assistant' พร้อมคำอธิบายหน้าที่ */
  private normalize(messages: ChatMessageInput[]) {
    return messages.map((m) => ({
      role: m.role === 'system' ? 'assistant' : m.role,
      content: m.role === 'system' ? `[ข้อกำหนดระบบ] ${m.content}` : m.content,
    }))
  }

  async *completeStream(opts: CompleteOptions): AsyncGenerator<string> {
    const zai = await this.client()
    const messages = this.normalize(opts.messages)
    let streamErr: unknown = null
    try {
      const stream = await withTimeout(
        zai.chat.completions.create({ messages, stream: true, thinking: { type: 'disabled' } }),
        (opts.timeoutMs ?? 120_000) * 0.8,
        'เริ่มตอบ',
      )
      if (stream) {
        /**
         * SDK อาจคืน 2 รูปแบบ:
         * 1) async iterable ของ object แบบ OpenAI ({choices:[{delta:{content}}]})
         * 2) ข้อความ SSE ดิบ (string) — แต่ละชิ้นอาจเป็นตัวอักษรเดี่ยว
         *    เช่น 'data: {"id":...}\n\n' — ต้องเก็บ buffer แล้ว parse เอง
         */
        let buf = ''
        let emitted = false
        const drainBuffer = function* (): Generator<string> {
          const parts = buf.split('\n')
          buf = parts.pop() ?? ''
          for (const line of parts) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const payload = t.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
              const c = j?.choices?.[0]?.delta?.content
              if (c) yield c
            } catch {
              /* ข้ามบรรทัดที่ parse ไม่ได้ */
            }
          }
        }
        for await (const chunk of stream as AsyncIterable<unknown>) {
          if (chunk && typeof chunk === 'object') {
            const text = (chunk as { choices?: { delta?: { content?: string } }[] })?.choices?.[0]?.delta?.content
            if (text) {
              emitted = true
              yield text
            }
          } else if (typeof chunk === 'string') {
            buf += chunk
            if (chunk.includes('\n')) {
              for (const c of drainBuffer()) {
                emitted = true
                yield c
              }
            }
          }
        }
        // flush บรรทัดสุดท้ายที่ไม่มี \n ปิดท้าย
        buf += '\n'
        for (const c of drainBuffer()) {
          emitted = true
          yield c
        }
        if (emitted) return
      }
    } catch (e) {
      streamErr = e
    }
    // ถ้า stream ใช้ไม่ได้ ลองแบบรอครั้งเดียวจบ
    try {
      const res = await withTimeout(
        zai.chat.completions.create({ messages, thinking: { type: 'disabled' } }),
        opts.timeoutMs ?? 120_000,
        'สร้างคำตอบ',
      )
      const text = (res as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? ''
      if (text) yield text
      else if (streamErr) throw streamErr
    } catch (e) {
      throw streamErr && !(e instanceof Error && String(e.message).includes('ใช้เวลา')) ? streamErr : e
    }
  }

  async complete(opts: CompleteOptions): Promise<string> {
    let out = ''
    for await (const t of this.completeStream(opts)) out += t
    return out
  }

  /** วิเคราะห์รูปภาพ (multimodal) */
  async vision(prompt: string, images: ImagePart[], timeoutMs = 90_000): Promise<string> {
    const zai = await this.client()
    const content = mergeImages(prompt, images) as string | VisionMultimodalContentItem[]
    const body = { messages: [{ role: 'user', content }] } as unknown as CreateChatCompletionVisionBody
    const res = await withTimeout(
      zai.chat.completions.createVision(body),
      timeoutMs,
      'วิเคราะห์รูปภาพ',
    )
    return (res as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? ''
  }
}

/* ---------------- OpenAI-Compatible (fetch + SSE) ---------------- */

class OpenAICompatProvider implements ChatProvider {
  id: string
  label: string
  supportsVision: boolean
  supportsStream = true
  available = true
  protected cfg: OpenAICompatConfig

  constructor(id: string, cfg: OpenAICompatConfig) {
    this.id = id
    this.cfg = cfg
    this.label = cfg.label || id
    this.supportsVision = cfg.supportsVision !== false
    this.available = id === 'ollama' ? Boolean(cfg.baseURL) : Boolean(cfg.baseURL && cfg.apiKey)
  }

  protected endpoint(): string {
    const base = (this.cfg.baseURL || '').replace(/\/+$/, '')
    return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  }

  protected headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.cfg.apiKey) h.Authorization = `Bearer ${this.cfg.apiKey}`
    return h
  }

  private body(messages: ChatMessageInput[], stream: boolean, temperature?: number) {
    return JSON.stringify({
      model: this.cfg.model,
      stream,
      temperature: temperature ?? 0.3,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.images?.length ? mergeImages(m.content, m.images) : m.content,
      })),
    })
  }

  async *completeStream(opts: CompleteOptions): AsyncGenerator<string> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000)
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: this.body(opts.messages, true, opts.temperature),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new Error(`ผู้ให้บริการตอบ ${res.status}: ${detail.slice(0, 200)}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let emitted = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          const payload = t.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
            const text = j?.choices?.[0]?.delta?.content
            if (text) {
              emitted = true
              yield text
            }
          } catch {
            /* ข้ามบรรทัดที่ parse ไม่ได้ */
          }
        }
      }
      if (!emitted) throw new Error('ผู้ให้บริการไม่ส่งข้อความกลับ')
    } finally {
      clearTimeout(timer)
    }
  }

  async complete(opts: CompleteOptions): Promise<string> {
    let out = ''
    try {
      for await (const t of this.completeStream(opts)) out += t
    } catch {
      // ลองแบบไม่ stream
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000)
      try {
        const res = await fetch(this.endpoint(), {
          method: 'POST',
          headers: this.headers(),
          body: this.body(opts.messages, false, opts.temperature),
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`ผู้ให้บริการตอบ ${res.status}`)
        const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        out = j?.choices?.[0]?.message?.content ?? ''
      } finally {
        clearTimeout(timer)
      }
    }
    return out
  }
}

class OllamaProvider extends OpenAICompatProvider {
  constructor(cfg: OllamaConfig) {
    const compat: OpenAICompatConfig = { ...cfg, apiKey: 'ollama' }
    super('ollama', compat)
  }
}

/* ---------------- Registry ---------------- */

export async function listProviders(): Promise<{ providers: ProviderInfo[]; activeProvider: string }> {
  const [ai, pc] = await Promise.all([getAIConfig(), getProviderConfig()])
  const zai = new ZAIProvider()
  const openai = new OpenAICompatProvider('openai', pc.openai)
  const ollama = new OllamaProvider(pc.ollama)
  const providers: ProviderInfo[] = [zai, openai, ollama].map((p) => ({
    id: p.id,
    label: p.label,
    supportsVision: p.supportsVision,
    supportsStream: p.supportsStream,
    available: p.available,
  }))
  const active = providers.some((p) => p.id === ai.activeProvider && p.available)
    ? ai.activeProvider
    : 'zai'
  return { providers, activeProvider: active }
}

export async function getProvider(name?: string): Promise<ChatProvider> {
  const { activeProvider } = await listProviders()
  const chosen = name && name !== 'zai' ? name : activeProvider
  const pc = await getProviderConfig()
  if (chosen === 'openai' && pc.openai.baseURL && pc.openai.apiKey) {
    return new OpenAICompatProvider('openai', pc.openai)
  }
  if (chosen === 'ollama' && pc.ollama.baseURL) {
    const ollamaCfg: OllamaConfig = {
      label: pc.ollama.label,
      baseURL: pc.ollama.baseURL,
      model: pc.ollama.model,
      supportsVision: pc.ollama.supportsVision,
    }
    return new OllamaProvider(ollamaCfg)
  }
  return new ZAIProvider()
}

/** ตรวจว่า AI พร้อมใช้จริงไหม (เรียกข้อความสั้น) */
export async function pingAI(provider?: string): Promise<{ ok: boolean; ms: number; provider: string; error?: string }> {
  const started = Date.now()
  try {
    const p = await getProvider(provider)
    const text = await p.complete({
      messages: [{ role: 'user', content: 'ตอบสั้นที่สุด: OK' }],
      timeoutMs: 30_000,
    })
    return { ok: text.trim().length > 0, ms: Date.now() - started, provider: p.id }
  } catch (e) {
    return { ok: false, ms: Date.now() - started, provider: provider ?? 'zai', error: e instanceof Error ? e.message : String(e) }
  }
}

/** rate limit แบบง่าย: ไม่เกิน maxPerMinute คำขอ/นาที ต่อผู้ใช้ */
const minuteBuckets = new Map<string, { n: number; resetAt: number }>()
export function allowPerMinute(userId: string, maxPerMinute = 20): boolean {
  const now = Date.now()
  const b = minuteBuckets.get(userId)
  if (!b || b.resetAt < now) {
    minuteBuckets.set(userId, { n: 1, resetAt: now + 60_000 })
    return true
  }
  if (b.n >= maxPerMinute) return false
  b.n += 1
  return true
}

export type { AiConfig, ProviderConfig }
