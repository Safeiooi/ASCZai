/** ชนิดข้อมูลสัญญา (contract) ที่ใช้ร่วมกันระหว่าง API และหน้าบ้าน */

export type Role = 'admin' | 'user'

export interface MeUser {
  id: string
  email: string
  name: string
  role: Role
}

export interface QuotaInfo {
  used: number
  limit: number
}

export interface BootRes {
  user: MeUser | null
  aiEnabled: boolean
  quota: QuotaInfo
}

export interface ProviderInfo {
  id: string
  label: string
  supportsVision: boolean
  supportsStream: boolean
  available: boolean
}

export interface ProvidersRes {
  providers: ProviderInfo[]
  activeProvider: string
}

export interface DocListItem {
  id: string
  title: string
  source: string | null
  sourceType: string
  category: string
  status: string // published | review | error
  note: string | null
  version: number
  size: number
  chunkCount: number
  createdAt: string
  updatedAt: string
}

export interface DocsRes {
  docs: DocListItem[]
}

export interface ImportItem {
  file: string
  status: 'imported' | 'skipped' | 'failed'
  chunks?: number
  docStatus?: string
  error?: string
  note?: string
}

export interface ImportRes {
  ok: boolean
  found: number
  imported: number
  skipped: number
  failed: number
  items: ImportItem[]
  ms: number
}

export interface Citation {
  id: string
  documentId: string
  docTitle: string
  heading: string | null
  snippet: string
  source: string | null
  score: number
  level: 'confirmed' | 'similar' // มีเอกสารยืนยัน / พบเคสคล้ายกัน
}

export interface SearchRes {
  query: string
  results: Citation[]
  ms: number
}

export interface Attachment {
  name: string
  path?: string // URL ที่เปิดดูได้ เช่น /api/chat/images/xxx.png
  mime?: string
  size?: number
}

export interface MessageMeta {
  provider?: string
  ocrEngine?: 'tesseract' | 'vlm' | 'none'
  ocrMs?: number
  searchMs?: number
  modelMs?: number
  totalMs?: number
  warning?: string
  searchOnly?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  citations?: Citation[]
  meta?: MessageMeta
  createdAt: string
}

export interface ChatSessionItem {
  id: string
  title: string
  updatedAt: string
  messageCount: number
}

export interface SessionsRes {
  sessions: ChatSessionItem[]
}

export interface SessionDetailRes {
  session: { id: string; title: string; provider: string | null }
  messages: ChatMessage[]
}

export interface UserItem {
  id: string
  email: string
  name: string | null
  role: Role
  status: string
  createdAt: string
  quotaUsed: number
}

export interface UsersRes {
  users: UserItem[]
}

export interface AiConfig {
  enabled: boolean
  dailyQuota: number
  timeoutMs: number
  contextChunks: number
  activeProvider: string
}

export interface OpenAICompatConfig {
  label: string
  baseURL: string
  apiKey: string
  model: string
  supportsVision: boolean
}

export interface OllamaConfig {
  label: string
  baseURL: string
  model: string
  supportsVision: boolean
}

export interface ProviderConfig {
  openai: OpenAICompatConfig
  ollama: OllamaConfig
}

export interface SettingsRes {
  ai: AiConfig
  providers: ProviderConfig
}

export interface StatsRes {
  docs: number
  chunks: number
  publishedDocs: number
  reviewDocs: number
  errorDocs: number
  users: number
  sessions: number
  messages: number
  todayQueries: number
  feedbackUp: number
  feedbackDown: number
}

export interface FeedbackItem {
  id: string
  userName: string
  rating: string
  comment: string | null
  messageContent: string | null
  createdAt: string
}

export interface AdminOverviewRes {
  stats: StatsRes
  feedbacks: FeedbackItem[]
}

/** เหตุการณ์ SSE จาก /api/chat/ask */
export type AskSseEvent =
  | { type: 'started'; sessionId: string; userMessageId: string; userAttachments: Attachment[] }
  | { type: 'status'; stage: 'ocr' | 'search' | 'compose'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'citations'; citations: Citation[]; ocrEngine?: string; ocrMs?: number; hasImages?: boolean; searchMs?: number }
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string; meta: MessageMeta }
  | { type: 'error'; message: string }
