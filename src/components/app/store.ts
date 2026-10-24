'use client'

import { create } from 'zustand'
import { signIn, signOut } from 'next-auth/react'
import type {
  AdminOverviewRes,
  AppView,
  Attachment,
  BootRes,
  ChatSessionItem,
  Citation,
  DocListItem,
  MessageMeta,
  PendingImage,
  ProviderInfo,
  SettingsRes,
  UiMessage,
  UserItem,
} from '@/components/app/types'

const MAX_IMAGES = 4
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

interface AppState {
  // boot / auth
  booted: boolean
  user: { id: string; email: string; name: string; role: 'admin' | 'user' } | null
  aiEnabled: boolean
  quota: { used: number; limit: number }
  bootError: string | null
  // nav
  view: AppView
  sidebarOpen: boolean
  // providers
  providers: ProviderInfo[]
  selectedProvider: string | null
  ocrMode: boolean
  // chat
  sessions: ChatSessionItem[]
  activeSessionId: string | null
  messages: UiMessage[]
  streaming: boolean
  statusLine: string | null
  sendError: string | null
  attachments: PendingImage[]
  imageViewer: string | null
  // knowledge
  docs: DocListItem[]
  docsLoading: boolean
  lastImport: { imported: number; skipped: number; failed: number; ms: number } | null
  // admin
  users: UserItem[]
  settings: SettingsRes | null
  overview: AdminOverviewRes | null

  // actions
  boot: () => Promise<void>
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  setView: (v: AppView) => void
  setSidebarOpen: (open: boolean) => void
  loadProviders: () => Promise<void>
  setSelectedProvider: (id: string) => void
  setOcrMode: (on: boolean) => void
  // chat
  loadSessions: () => Promise<void>
  newSession: () => void
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  send: (question: string) => Promise<void>
  stop: () => void
  addImages: (files: File[]) => Promise<void>
  removeImage: (idx: number) => void
  clearImages: () => void
  setImageViewer: (url: string | null) => void
  feedback: (messageId: string, rating: 'up' | 'down') => Promise<void>
  // knowledge
  loadDocs: () => Promise<void>
  importDocs: (files: File[]) => Promise<void>
  updateDoc: (id: string, patch: { title?: string; category?: string; status?: string }) => Promise<void>
  deleteDoc: (id: string) => Promise<void>
  // admin
  loadUsers: () => Promise<void>
  createUser: (data: { email: string; name: string; password: string; role: 'admin' | 'user' }) => Promise<string | null>
  updateUser: (id: string, patch: { name?: string; role?: 'admin' | 'user'; status?: string; password?: string }) => Promise<string | null>
  deleteUser: (id: string) => Promise<string | null>
  loadSettings: () => Promise<void>
  saveSettings: (patch: Record<string, unknown>) => Promise<string | null>
  loadOverview: () => Promise<void>
}

let abortController: AbortController | null = null

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  booted: false,
  user: null,
  aiEnabled: true,
  quota: { used: 0, limit: 300 },
  bootError: null,
  view: 'chat',
  sidebarOpen: false,
  providers: [],
  selectedProvider: null,
  ocrMode: false,
  sessions: [],
  activeSessionId: null,
  messages: [],
  streaming: false,
  statusLine: null,
  sendError: null,
  attachments: [],
  imageViewer: null,
  docs: [],
  docsLoading: false,
  lastImport: null,
  users: [],
  settings: null,
  overview: null,

  async boot() {
    const res = await getJson<BootRes>('/api/boot')
    if (!res) {
      set({ booted: true, bootError: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองรีเฟรชหน้าจอ' })
      return
    }
    set({
      booted: true,
      user: res.user,
      aiEnabled: res.aiEnabled,
      quota: res.quota,
      bootError: null,
    })
    if (res.user) {
      // โหลดเสริมแบบไม่บล็อกหน้าจอ
      void get().loadSessions()
      void get().loadProviders()
    }
  },

  async login(email, password) {
    try {
      const res = await signIn('credentials', { redirect: false, email, password })
      if (res?.error) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      await get().boot()
      return null
    } catch {
      return 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง'
    }
  },

  async logout() {
    await signOut({ redirect: false })
    set({
      user: null,
      sessions: [],
      messages: [],
      activeSessionId: null,
      docs: [],
      users: [],
      settings: null,
      overview: null,
      providers: [],
      selectedProvider: null,
      view: 'chat',
      attachments: [],
    })
  },

  setView(v) {
    set({ view: v, sidebarOpen: false })
    if (v === 'knowledge') void get().loadDocs()
    if (v === 'admin') {
      void get().loadOverview()
      void get().loadUsers()
      void get().loadSettings()
    }
  },
  setSidebarOpen(open) {
    set({ sidebarOpen: open })
  },

  async loadProviders() {
    const res = await getJson<{ providers: ProviderInfo[]; activeProvider: string }>('/api/ai/providers')
    if (res) {
      set((s) => ({
        providers: res.providers,
        selectedProvider: s.selectedProvider ?? res.activeProvider,
      }))
    }
  },
  setSelectedProvider(id) {
    set({ selectedProvider: id })
  },
  setOcrMode(on) {
    set({ ocrMode: on })
  },

  async loadSessions() {
    const res = await getJson<{ sessions: ChatSessionItem[] }>('/api/chat/sessions')
    if (res) set({ sessions: res.sessions })
  },

  newSession() {
    set({ activeSessionId: null, messages: [], statusLine: null, sendError: null })
  },

  async openSession(id) {
    set({ activeSessionId: id, messages: [], statusLine: null })
    const res = await getJson<{
      session: { id: string; title: string; provider: string | null }
      messages: UiMessage[]
    }>(`/api/chat/sessions/${id}`)
    if (res) {
      set({
        messages: res.messages.map((m) => ({ ...m, status: 'done' as const })),
        selectedProvider: res.session.provider ?? get().selectedProvider,
      })
    }
  },

  async deleteSession(id) {
    await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' })
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
      messages: s.activeSessionId === id ? [] : s.messages,
    }))
  },

  stop() {
    abortController?.abort()
    abortController = null
    set((s) => ({
      streaming: false,
      statusLine: null,
      messages: s.messages.map((m) => (m.status === 'streaming' ? { ...m, status: 'done' as const } : m)),
    }))
  },

  async addImages(files) {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    const next: PendingImage[] = []
    for (const f of files) {
      if (!allowed.includes(f.type)) continue
      if (f.size > MAX_IMAGE_SIZE) continue
      const dataUrl = await fileToDataUrl(f)
      next.push({ name: f.name, dataUrl, mime: f.type, size: f.size })
      if (get().attachments.length + next.length >= MAX_IMAGES) break
    }
    set((s) => ({ attachments: [...s.attachments, ...next].slice(0, MAX_IMAGES) }))
  },
  removeImage(idx) {
    set((s) => ({ attachments: s.attachments.filter((_, i) => i !== idx) }))
  },
  clearImages() {
    set({ attachments: [] })
  },
  setImageViewer(url) {
    set({ imageViewer: url })
  },

  async send(question) {
    const state = get()
    if (state.streaming) return
    const q = question.trim()
    const images = state.attachments
    if (!q && images.length === 0) return

    const tempId = `temp-${Date.now()}`
    const userMsg: UiMessage = {
      id: tempId,
      role: 'user',
      content: q,
      attachments: images.map((i) => ({ name: i.name, mime: i.mime, size: i.size })),
      createdAt: new Date().toISOString(),
      status: 'sending',
    }
    const assistantMsg: UiMessage = {
      id: `stream-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
    }
    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      streaming: true,
      statusLine: 'กำลังเตรียมข้อมูล…',
      sendError: null,
      attachments: [],
    }))

    abortController = new AbortController()
    const patchUser = (patch: Partial<UiMessage>) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === tempId ? { ...m, ...patch } : m)) }))
    const patchAssistant = (patch: Partial<UiMessage>) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
      }))
    const appendDelta = (text: string) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + text } : m)),
      }))

    try {
      const res = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.activeSessionId,
          question: q,
          provider: state.selectedProvider,
          ocrMode: state.ocrMode,
          images: images.map((i) => ({ dataUrl: i.dataUrl, name: i.name, mimeType: i.mime })),
        }),
        signal: abortController.signal,
      })
      if (!res.ok || !res.body) {
        let msg = 'ส่งคำถามไม่สำเร็จ'
        try {
          const j = (await res.json()) as { error?: string }
          msg = j.error ?? msg
        } catch {}
        throw new Error(msg)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let streamError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5).trim()) as
              | { type: 'started'; sessionId: string; userMessageId: string; userAttachments: Attachment[] }
              | { type: 'status'; stage: string; message: string }
              | { type: 'warning'; message: string }
              | { type: 'citations'; citations: Citation[]; ocrEngine?: string; ocrMs?: number; hasImages?: boolean; searchMs?: number }
              | { type: 'delta'; text: string }
              | { type: 'done'; messageId: string; meta: MessageMeta }
              | { type: 'error'; message: string }
            if (ev.type === 'started') {
              patchUser({ id: ev.userMessageId, status: 'done', attachments: ev.userAttachments })
              if (!state.activeSessionId) set({ activeSessionId: ev.sessionId })
            } else if (ev.type === 'status') {
              set({ statusLine: ev.message })
              patchAssistant({ statusLine: ev.message })
            } else if (ev.type === 'warning') {
              patchAssistant({ meta: { warning: ev.message } })
            } else if (ev.type === 'citations') {
              patchAssistant({
                citations: ev.citations,
                meta: {
                  ocrEngine: ev.ocrEngine as MessageMeta['ocrEngine'],
                  ocrMs: ev.ocrMs,
                  searchMs: ev.searchMs,
                },
              })
            } else if (ev.type === 'delta') {
              appendDelta(ev.text)
            } else if (ev.type === 'done') {
              const meta = ev.meta ?? {}
              const timingBits: string[] = []
              if (meta.searchMs) timingBits.push(`ค้นหา ${(meta.searchMs / 1000).toFixed(1)}s`)
              if (meta.ocrMs) timingBits.push(`OCR ${(meta.ocrMs / 1000).toFixed(1)}s`)
              if (meta.modelMs) timingBits.push(`โมเดล ${(meta.modelMs / 1000).toFixed(1)}s`)
              patchAssistant({ id: ev.messageId, status: 'done', meta, timingLine: timingBits.join(' · ') })
            } else if (ev.type === 'error') {
              streamError = ev.message
            }
          } catch {
            /* ข้ามชิ้นที่ parse ไม่ได้ */
          }
        }
      }
      if (streamError) {
        patchAssistant({ status: 'error', statusLine: streamError })
        set({ sendError: streamError })
      } else {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsg.id && !m.content ? { ...m, status: 'error' as const, statusLine: 'ไม่ได้รับคำตอบจากโมเดล' } : m,
          ),
        }))
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      if (!aborted) {
        const msg = e instanceof Error ? e.message : 'ส่งคำถามไม่สำเร็จ'
        patchAssistant({ status: 'error', statusLine: msg })
        set({ sendError: msg })
      }
    } finally {
      abortController = null
      set({ streaming: false, statusLine: null })
      void get().loadSessions()
      const b = await getJson<BootRes>('/api/boot')
      if (b?.user) set({ quota: b.quota, aiEnabled: b.aiEnabled })
    }
  },

  async feedback(messageId, rating) {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, rating }),
    })
  },

  async loadDocs() {
    set({ docsLoading: true })
    const res = await getJson<{ docs: DocListItem[] }>('/api/docs')
    if (res) set({ docs: res.docs })
    set({ docsLoading: false })
  },

  async importDocs(files) {
    if (files.length === 0) return
    set({ docsLoading: true })
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      const res = await fetch('/api/docs/import', { method: 'POST', body: fd })
      const j = (await res.json()) as { imported?: number; skipped?: number; failed?: number; ms?: number; error?: string }
      if (!res.ok) throw new Error(j.error ?? 'นำเข้าไม่สำเร็จ')
      set({
        lastImport: { imported: j.imported ?? 0, skipped: j.skipped ?? 0, failed: j.failed ?? 0, ms: j.ms ?? 0 },
      })
      await get().loadDocs()
    } catch {
      set({ lastImport: null })
    } finally {
      set({ docsLoading: false })
    }
  },

  async updateDoc(id, patch) {
    await fetch(`/api/docs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await get().loadDocs()
  },

  async deleteDoc(id) {
    await fetch(`/api/docs/${id}`, { method: 'DELETE' })
    await get().loadDocs()
  },

  async loadUsers() {
    const res = await getJson<{ users: UserItem[] }>('/api/admin/users')
    if (res) set({ users: res.users })
  },

  async createUser(data) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return j.error ?? 'เพิ่มผู้ใช้ไม่สำเร็จ'
    }
    await get().loadUsers()
    return null
  },

  async updateUser(id, patch) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return j.error ?? 'แก้ไขผู้ใช้ไม่สำเร็จ'
    }
    await get().loadUsers()
    return null
  },

  async deleteUser(id) {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return j.error ?? 'ลบผู้ใช้ไม่สำเร็จ'
    }
    await get().loadUsers()
    return null
  },

  async loadSettings() {
    const res = await getJson<SettingsRes>('/api/admin/settings')
    if (res) set({ settings: res })
  },

  async saveSettings(patch) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return j.error ?? 'บันทึกการตั้งค่าไม่สำเร็จ'
    }
    await get().loadSettings()
    await get().loadProviders()
    return null
  },

  async loadOverview() {
    const res = await getJson<AdminOverviewRes>('/api/admin/stats')
    if (res) set({ overview: res })
  },
}))
