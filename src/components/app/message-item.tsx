'use client'

import { useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { CircleAlert, Copy, Loader2, ScanText, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CitationsPanel } from '@/components/app/citations-panel'
import { useAppStore } from '@/components/app/store'
import type { Attachment, UiMessage } from '@/components/app/types'
import { cn } from '@/lib/utils'

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="scroll-thin my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = typeof className === 'string' && className.includes('language-')
    return (
      <code
        className={cn(
          'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]',
          isBlock && 'bg-transparent p-0 text-xs',
          className,
        )}
      >
        {children}
      </code>
    )
  },
}

const MD_BODY_CLASS =
  'break-words text-sm leading-relaxed ' +
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ' +
  '[&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-emerald-400 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground ' +
  '[&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold ' +
  '[&_hr]:my-3 [&_hr]:border-border ' +
  '[&_li]:ml-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ul]:my-1.5 [&_ul]:list-disc ' +
  '[&_p]:my-1.5 ' +
  '[&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left'

/** รูปแนบที่เปิดดูได้จริง (มี path) เท่านั้น */
function viewableAttachments(message: UiMessage): (Attachment & { path: string })[] {
  return (message.attachments ?? []).filter(
    (a): a is Attachment & { path: string } => typeof a.path === 'string' && a.path !== '',
  )
}

export function MessageItem({ message }: { message: UiMessage }) {
  const setImageViewer = useAppStore((s) => s.setImageViewer)
  const feedback = useAppStore((s) => s.feedback)
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)

  const handleCopy = () => {
    if (!navigator.clipboard) {
      toast.error('เบราว์เซอร์ไม่รองรับการคัดลอก')
      return
    }
    navigator.clipboard
      .writeText(message.content)
      .then(() => toast.success('คัดลอกแล้ว'))
      .catch(() => toast.error('คัดลอกไม่สำเร็จ'))
  }

  const handleVote = (rating: 'up' | 'down') => {
    if (voted) return
    setVoted(rating)
    void feedback(message.id, rating)
    toast('ขอบคุณสำหรับข้อมูลย้อนกลับ')
  }

  // ---------- ข้อความจากผู้ใช้ ----------
  if (message.role === 'user') {
    const images = viewableAttachments(message)
    return (
      <div className="flex flex-col items-end gap-1">
        {message.content !== '' && (
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
            {message.content}
          </div>
        )}
        {images.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {images.map((a) => (
              <img
                key={a.path}
                src={a.path}
                alt={a.name}
                title={a.name}
                onClick={() => setImageViewer(a.path)}
                className="size-[72px] cursor-zoom-in rounded-lg border border-emerald-200 object-cover transition-opacity hover:opacity-90 dark:border-emerald-900"
              />
            ))}
          </div>
        )}
        {message.status === 'sending' && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> กำลังส่ง…
          </span>
        )}
      </div>
    )
  }

  // ---------- ข้อความจากผู้ช่วย ----------
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const hasContent = message.content.length > 0
  const meta = message.meta

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={cn(
          'w-[85%] max-w-[85%] rounded-2xl rounded-bl-md border bg-card p-4 shadow-sm',
          isError && 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
        )}
      >
        {isError ? (
          <div className="flex items-start gap-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
            <div className="min-w-0">
              <p className="break-words font-medium text-red-700 dark:text-red-300">
                {message.statusLine ?? 'เกิดข้อผิดพลาด'}
              </p>
              <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/80">
                ลองส่งอีกครั้ง หรือเปลี่ยนผู้ให้บริการ AI ด้านล่าง
              </p>
            </div>
          </div>
        ) : isStreaming && !hasContent ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-emerald-600" />
            <span>{message.statusLine ?? 'กำลังคิดคำตอบ…'}</span>
          </div>
        ) : (
          <>
            <div className={MD_BODY_CLASS}>
              <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
              {isStreaming && (
                <span className="streaming-dot text-emerald-600" aria-hidden="true">
                  ▍
                </span>
              )}
            </div>
            <CitationsPanel citations={message.citations} />
            {(message.timingLine || meta?.ocrEngine || meta?.searchOnly || meta?.warning) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                {message.timingLine && <span>{message.timingLine}</span>}
                {meta?.ocrEngine === 'tesseract' && (
                  <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                    <ScanText className="size-3" /> OCR: Tesseract
                  </Badge>
                )}
                {meta?.ocrEngine === 'vlm' && (
                  <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                    <ScanText className="size-3" /> OCR: Vision
                  </Badge>
                )}
                {meta?.searchOnly && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-[10px] font-normal text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    โหมดค้นหา
                  </Badge>
                )}
                {meta?.warning && (
                  <Badge
                    variant="outline"
                    title={meta.warning}
                    className="max-w-[240px] cursor-help truncate border-amber-300 bg-amber-50 text-[10px] font-normal text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    คำเตือน
                  </Badge>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {message.status === 'done' && hasContent && (
        <div className="flex flex-wrap items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            <Copy className="size-3.5" /> คัดลอก
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={voted !== null}
            aria-label="คำตอบนี้มีประโยชน์"
            className={cn(
              'h-8 gap-1.5 px-2 text-xs',
              voted === 'up' ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => handleVote('up')}
          >
            <ThumbsUp className={cn('size-3.5', voted === 'up' && 'fill-emerald-600')} /> มีประโยชน์
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={voted !== null}
            aria-label="คำตอบนี้ยังไม่ถูกต้อง"
            className={cn(
              'h-8 gap-1.5 px-2 text-xs',
              voted === 'down' ? 'text-red-600' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => handleVote('down')}
          >
            <ThumbsDown className={cn('size-3.5', voted === 'down' && 'fill-red-600')} /> ยังไม่ถูกต้อง
          </Button>
        </div>
      )}
    </div>
  )
}
