'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Citation } from '@/components/app/types'
import { cn } from '@/lib/utils'

/** ป้ายระดับหลักฐาน: มีเอกสารยืนยัน (emerald) / พบเคสคล้ายกัน (amber) */
function LevelLabel({ level }: { level: Citation['level'] }) {
  const confirmed = level === 'confirmed'
  return (
    <span
      className={cn(
        'text-[11px] font-medium',
        confirmed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      )}
    >
      {confirmed ? 'มีเอกสารยืนยัน' : 'พบเคสคล้ายกัน'}
    </span>
  )
}

/**
 * แถบ "แหล่งอ้างอิง (n)" ใต้คำตอบ — กดเปิด Dialog รายการหลักฐานจากคลังความรู้
 */
export function CitationsPanel({ citations }: { citations?: Citation[] }) {
  const [open, setOpen] = useState(false)

  if (!citations || citations.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-8 gap-1.5 border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
        >
          <FileText className="size-3.5" />
          แหล่งอ้างอิง ({citations.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="scroll-thin max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แหล่งอ้างอิงจากฐานความรู้</DialogTitle>
          <DialogDescription>คำตอบอิงหลักฐานรายการต่อไปนี้ ({citations.length} รายการ)</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {citations.map((c, i) => (
            <Card key={c.id} className="gap-0 p-3">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="break-words text-sm font-medium leading-snug">{c.docTitle}</span>
                    {c.heading && (
                      <Badge variant="outline" className="max-w-full truncate text-[10px] font-normal">
                        {c.heading}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                    {c.snippet}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {c.source && <span className="break-all text-xs text-muted-foreground">{c.source}</span>}
                    <LevelLabel level={c.level} />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
