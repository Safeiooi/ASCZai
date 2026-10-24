'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CircleAlert,
  ImagePlus,
  Loader2,
  PanelLeftOpen,
  Paperclip,
  Plus,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { MessageItem } from '@/components/app/message-item'
import { useAppStore } from '@/components/app/store'
import { SUGGESTED_QUESTIONS } from '@/components/app/types'
import { cn } from '@/lib/utils'

/** วันที่แบบย่อภาษาไทย: วันนี้ 14:05 · เมื่อวาน · 3 วันก่อน */
function relativeDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  if (t >= startToday) return `วันนี้ ${time}`
  if (t >= startToday - 86_400_000) return `เมื่อวาน ${time}`
  const days = Math.floor((startToday - t) / 86_400_000)
  if (days < 30) return `${days} วันก่อน`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** รายการประวัติแชท — ใช้ร่วมกันทั้ง sidebar เดสก์ท็อปและ Sheet บนมือถือ */
function SessionsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const openSession = useAppStore((s) => s.openSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const newSession = useAppStore((s) => s.newSession)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">ประวัติแชท</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => {
            newSession()
            onNavigate?.()
          }}
        >
          <Plus className="size-4" /> แชทใหม่
        </Button>
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
          ยังไม่มีประวัติแชท
          <br />
          เริ่มถามคำถามแรกได้เลย
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {sessions.map((item) => {
              const active = item.id === activeSessionId
              return (
                <div key={item.id} className="group relative flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-auto min-h-11 w-full flex-1 justify-start overflow-hidden rounded-md px-2 py-1.5 text-left',
                      active &&
                        'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/70',
                    )}
                    onClick={() => {
                      void openSession(item.id)
                      onNavigate?.()
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-snug">{item.title}</span>
                      <span
                        className={cn(
                          'block truncate text-[11px] font-normal',
                          active ? 'text-emerald-600/90 dark:text-emerald-400/80' : 'text-muted-foreground',
                        )}
                      >
                        {relativeDate(item.updatedAt)} · {item.messageCount} ข้อความ
                      </span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`ลบแชท: ${item.title}`}
                    className="absolute right-1 size-8 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-70 dark:hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteSession(item.id)
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

const MAX_ATTACHMENTS = 4 // ตรงกับ MAX_IMAGES ใน store

export function ChatView() {
  // ข้อความในกล่องพิมพ์เก็บไว้ที่นี่ (local) — store เก็บเฉพาะข้อความที่ส่งแล้ว
  const [question, setQuestion] = useState('')
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false)

  const streaming = useAppStore((s) => s.streaming)
  const statusLine = useAppStore((s) => s.statusLine)
  const sendError = useAppStore((s) => s.sendError)
  const messages = useAppStore((s) => s.messages)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const attachments = useAppStore((s) => s.attachments)
  const providers = useAppStore((s) => s.providers)
  const selectedProvider = useAppStore((s) => s.selectedProvider)
  const ocrMode = useAppStore((s) => s.ocrMode)

  const send = useAppStore((s) => s.send)
  const stop = useAppStore((s) => s.stop)
  const addImages = useAppStore((s) => s.addImages)
  const removeImage = useAppStore((s) => s.removeImage)
  const setOcrMode = useAppStore((s) => s.setOcrMode)
  const setSelectedProvider = useAppStore((s) => s.setSelectedProvider)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeProvider = providers.find((p) => p.id === selectedProvider) ?? null
  const loadingSession = activeSessionId !== null && messages.length === 0 && !streaming

  // เลื่อนลงล่างอัตโนมัติเมื่อมีข้อความ/ข้อความ stream ใหม่ (ถ้าผู้ใช้ไม่ได้เลื่อนอ่านข้อความเก่าอยู่)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const handleSend = async () => {
    if (streaming) return
    if (!question.trim() && attachments.length === 0) return
    const q = question
    setQuestion('')
    const ta = textareaRef.current
    if (ta) autoGrow(ta)
    await send(q)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter ส่ง / Shift+Enter ขึ้นบรรทัดใหม่ / ข้ามระหว่างพิมพ์ภาษาไทย-อังกฤษด้วย IME
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) void addImages(files)
    e.target.value = '' // รีเซ็ตเพื่อเลือกไฟล์เดิมซ้ำได้
  }

  const canSend = !streaming && (question.trim() !== '' || attachments.length > 0)

  return (
    <div className="flex min-h-0 flex-1">
      {/* Sidebar ประวัติแชท (เดสก์ท็อป) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
        <SessionsPanel />
      </aside>

      {/* คอลัมน์แชทหลัก */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* แถบมือถือ: เปิดประวัติแชท */}
        <div className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1.5 md:hidden">
          <Sheet open={mobileSessionsOpen} onOpenChange={setMobileSessionsOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="เปิดประวัติแชท">
                <PanelLeftOpen className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>ประวัติแชท</SheetTitle>
              </SheetHeader>
              <SessionsPanel onNavigate={() => setMobileSessionsOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="truncate text-sm text-muted-foreground">ถาม-ตอบกับผู้ช่วย ASC</span>
        </div>

        {/* พื้นที่ข้อความ */}
        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current
            if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
          }}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4"
        >
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {loadingSession ? (
              // กำลังเปิดประวัติแชท — โหลดข้อความจากเซิร์ฟเวอร์
              <>
                <div className="flex justify-start">
                  <Skeleton className="h-16 w-3/4 rounded-2xl" />
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-10 w-1/3 rounded-2xl" />
                </div>
                <div className="flex justify-start">
                  <Skeleton className="h-24 w-2/3 rounded-2xl" />
                </div>
              </>
            ) : messages.length === 0 ? (
              // หน้าว่าง — ชวนถาม
              <div className="flex flex-col items-center gap-4 py-8 text-center sm:py-12">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                  <Sparkles className="size-6" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">ถามได้ทุกเรื่องเกี่ยวกับงาน PEAK และ SOP ของทีม</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ทุกคำตอบพร้อมแหล่งอ้างอิงจากคลังความรู้ทีม — แนบภาพหน้าจอปัญหาได้ด้วย
                  </p>
                </div>
                <div className="flex w-full max-w-md flex-col gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <Button
                      key={q}
                      type="button"
                      variant="outline"
                      className="h-11 justify-start whitespace-normal px-4 text-left text-sm font-normal"
                      onClick={() => void send(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <MessageItem key={m.id} message={m} />)
            )}
          </div>
        </div>

        {/* กล่องพิมพ์ */}
        <div className="shrink-0 border-t bg-background">
          <div className="mx-auto w-full max-w-3xl p-3">
            {streaming && statusLine && (
              <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-600" />
                <span className="truncate">{statusLine}</span>
              </p>
            )}
            {sendError && (
              <div
                role="alert"
                className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span className="break-words">{sendError}</span>
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={`${a.name}-${i}`} className="flex flex-col items-center gap-0.5">
                    <div className="relative">
                      <img
                        src={a.dataUrl}
                        alt={a.name}
                        className="size-16 rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label={`ถอดรูป ${a.name}`}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-red-600"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    <span className="w-16 truncate text-center text-[10px] text-muted-foreground" title={a.name}>
                      {a.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={(e) => autoGrow(e.currentTarget)}
              placeholder="พิมพ์คำถาม หรือแนบภาพหน้าจอปัญหา…"
              rows={1}
              aria-label="กล่องพิมพ์คำถาม"
              className="scroll-thin max-h-40 min-h-11 resize-none text-sm md:min-h-10"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleFiles}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10 shrink-0 md:size-9"
                disabled={streaming || attachments.length >= MAX_ATTACHMENTS}
                aria-label={`แนบรูปภาพ (สูงสุด ${MAX_ATTACHMENTS} รูป)`}
                title={`แนบรูปภาพ (สูงสุด ${MAX_ATTACHMENTS} รูป)`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4 md:hidden" />
                <ImagePlus className="hidden size-4 md:block" />
              </Button>
              {attachments.length > 0 && (
                <div className="flex items-center gap-2">
                  <Switch id="ocr-mode" checked={ocrMode} onCheckedChange={setOcrMode} />
                  <Label htmlFor="ocr-mode" className="cursor-pointer text-xs font-normal text-muted-foreground">
                    อ่านข้อความจากภาพ (OCR) — เร็วกว่า
                  </Label>
                </div>
              )}
              <Select value={selectedProvider ?? 'zai'} onValueChange={setSelectedProvider}>
                <SelectTrigger
                  aria-label="เลือกผู้ให้บริการ AI"
                  className="h-10 w-[150px] shrink-0 text-xs md:h-9 md:w-[180px]"
                >
                  <SelectValue placeholder="ผู้ให้บริการ AI" />
                </SelectTrigger>
                <SelectContent>
                  {providers.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">กำลังโหลดผู้ให้บริการ…</p>
                  ) : (
                    providers.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={!p.available} className="text-xs">
                        {p.label}
                        {!p.available ? ' (ยังเชื่อมไม่ได้)' : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {streaming ? (
                  <Button type="button" variant="outline" className="h-10 md:h-9" onClick={() => stop()}>
                    <Square className="size-4 fill-current" /> หยุด
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={!canSend}
                    className="h-10 bg-emerald-600 px-4 text-white hover:bg-emerald-700 md:h-9"
                    onClick={() => void handleSend()}
                  >
                    <SendHorizontal className="size-4" /> ส่ง
                  </Button>
                )}
              </div>
            </div>
            {attachments.length > 0 && activeProvider && !activeProvider.supportsVision && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                ผู้ให้บริการนี้ไม่รองรับรูปภาพโดยตรง จะใช้ OCR อัตโนมัติ
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
