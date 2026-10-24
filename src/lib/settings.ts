import { db } from '@/lib/db'
import type { AiConfig, ProviderConfig } from '@/lib/types'

const AI_KEY = 'aiConfig'
const PROVIDER_KEY = 'providerConfig'

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: true,
  dailyQuota: 300,
  timeoutMs: 120_000,
  contextChunks: 6,
  activeProvider: 'zai',
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  openai: {
    label: 'OpenAI-Compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'openai/gpt-4o-mini',
    supportsVision: true,
  },
  ollama: {
    label: 'Ollama (local)',
    baseURL: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2-vision',
    supportsVision: true,
  },
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.setting.findUnique({ where: { key } })
    if (!row) return fallback
    const parsed = JSON.parse(row.value) as Partial<T>
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

async function writeSetting(key: string, value: unknown) {
  await db.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { key, value: JSON.stringify(value) },
  })
}

export function getAIConfig(): Promise<AiConfig> {
  return readSetting<AiConfig>(AI_KEY, DEFAULT_AI_CONFIG)
}

export function saveAIConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
  return (async () => {
    const current = await getAIConfig()
    const next: AiConfig = { ...current, ...patch }
    next.dailyQuota = Math.max(1, Math.min(100_000, Math.round(next.dailyQuota)))
    next.timeoutMs = Math.max(5_000, Math.min(600_000, Math.round(next.timeoutMs)))
    next.contextChunks = Math.max(1, Math.min(20, Math.round(next.contextChunks)))
    await writeSetting(AI_KEY, next)
    return next
  })()
}

export function getProviderConfig(): Promise<ProviderConfig> {
  return readSetting<ProviderConfig>(PROVIDER_KEY, DEFAULT_PROVIDER_CONFIG)
}

export function saveProviderConfig(patch: Partial<ProviderConfig>): Promise<ProviderConfig> {
  return (async () => {
    const current = await getProviderConfig()
    const next: ProviderConfig = {
      openai: { ...current.openai, ...(patch.openai ?? {}) },
      ollama: { ...current.ollama, ...(patch.ollama ?? {}) },
    }
    await writeSetting(PROVIDER_KEY, next)
    return next
  })()
}
