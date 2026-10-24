import { getSessionUser } from '@/lib/auth'
import { badRequest, forbidden, json, unauthorized } from '@/lib/api'
import { getAIConfig, getProviderConfig, saveAIConfig, saveProviderConfig } from '@/lib/settings'
import type {
  AiConfig,
  OllamaConfig,
  OpenAICompatConfig,
  ProviderConfig,
  SettingsRes,
} from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVIDER_IDS = ['zai', 'openai', 'ollama'] as const

function maskKey(key: string): string {
  return key ? `••••••••${key.slice(-4)}` : ''
}

function maskForClient(pc: ProviderConfig): ProviderConfig {
  return {
    openai: { ...pc.openai, apiKey: maskKey(pc.openai.apiKey) },
    ollama: { ...pc.ollama },
  }
}

/** GET /api/admin/settings — ค่าตั้ง AI + provider (ปกปิด apiKey) เฉพาะแอดมิน */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const [ai, pc] = await Promise.all([getAIConfig(), getProviderConfig()])
  const res: SettingsRes = { ai, providers: maskForClient(pc) }
  return json(res)
}

/** PATCH /api/admin/settings — บันทึกค่าตั้ง AI + provider (เฉพาะแอดมิน) */
export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  let body: { ai?: unknown; providers?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return badRequest('รูปแบบคำขอไม่ถูกต้อง')
  }

  const aiPatch: Partial<AiConfig> = {}
  if (body.ai && typeof body.ai === 'object') {
    const a = body.ai as Record<string, unknown>
    if (typeof a.enabled === 'boolean') aiPatch.enabled = a.enabled
    if (typeof a.activeProvider === 'string' && (PROVIDER_IDS as readonly string[]).includes(a.activeProvider)) {
      aiPatch.activeProvider = a.activeProvider
    }
    for (const key of ['dailyQuota', 'timeoutMs', 'contextChunks'] as const) {
      const n = Number(a[key])
      if (Number.isFinite(n)) aiPatch[key] = n
    }
  }

  const providerPatch: { openai?: Partial<OpenAICompatConfig>; ollama?: Partial<OllamaConfig> } = {}
  if (body.providers && typeof body.providers === 'object') {
    const p = body.providers as { openai?: Record<string, unknown>; ollama?: Record<string, unknown> }

    if (p.openai && typeof p.openai === 'object') {
      const current = await getProviderConfig()
      const o: Partial<OpenAICompatConfig> = {}
      if (typeof p.openai.label === 'string') o.label = p.openai.label
      if (typeof p.openai.baseURL === 'string') o.baseURL = p.openai.baseURL
      if (typeof p.openai.model === 'string') o.model = p.openai.model
      if (typeof p.openai.supportsVision === 'boolean') o.supportsVision = p.openai.supportsVision
      if (typeof p.openai.apiKey === 'string') {
        // ค่าที่ถูกปกปิด (มี •) = ไม่เปลี่ยน ใช้ค่าจริงใน DB ต่อ
        o.apiKey = p.openai.apiKey.includes('•') ? current.openai.apiKey : p.openai.apiKey
      }
      providerPatch.openai = o
    }
    if (p.ollama && typeof p.ollama === 'object') {
      const o: Partial<OllamaConfig> = {}
      if (typeof p.ollama.label === 'string') o.label = p.ollama.label
      if (typeof p.ollama.baseURL === 'string') o.baseURL = p.ollama.baseURL
      if (typeof p.ollama.model === 'string') o.model = p.ollama.model
      if (typeof p.ollama.supportsVision === 'boolean') o.supportsVision = p.ollama.supportsVision
      providerPatch.ollama = o
    }
  }

  const hasAiPatch = Object.keys(aiPatch).length > 0
  const hasProviderPatch = Object.keys(providerPatch.openai ?? {}).length > 0
    || Object.keys(providerPatch.ollama ?? {}).length > 0
  if (!hasAiPatch && !hasProviderPatch) return badRequest('ไม่มีข้อมูลให้บันทึก')

  if (hasAiPatch) await saveAIConfig(aiPatch)
  if (hasProviderPatch) await saveProviderConfig(providerPatch as Partial<ProviderConfig>)

  const [ai, pc] = await Promise.all([getAIConfig(), getProviderConfig()])
  const res: SettingsRes = { ai, providers: maskForClient(pc) }
  return json(res)
}
