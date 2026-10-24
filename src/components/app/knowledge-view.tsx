'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, FolderOpen, Loader2, Pencil, Search, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from './store'
import type { Citation, DocListItem, SearchRes } from './types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

/** ผลลัพธ์จาก GET /api/docs/[id] (ตาม contract ฝั่งเซิร์ฟเวอร์) */
interface DocDetailRes {
  doc: DocListItem
  chunks: { id: string; idx: number; heading: string | null; content: string }[]
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'ทั่วไป',
  manual: 'คู่มือ',
  product: 'สเปกผลิตภัณฑ์',
  cases: 'เคส/Bug',
  other: 'อื่น ๆ',
}

const IMPORT_ACCEPT = '.zip,.md,.markdown,.txt,.csv,.xlsx,.xls,.json'

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">เผยแพร่</Badge>
    )
  }
  if (status === 'review') {
    return <Badge className="border-amber-200 bg-amber-100 text-amber-700">รอตรวจสอบ</Badge>
  }
  return <Badge className="border-red-200 bg-red-100 text-red-700">ผิดพลาด</Badge>
}

function CitationRow({ item }: { item: Citation }) {
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-medium">{item.docTitle}</p>
        {item.heading && <Badge variant="outline">{item.heading}</Badge>}
        <Badge
          variant="outline"
          className={
            item.level === 'confirmed'
              ? 'border-emerald-200 text-emerald-700'
              : 'border-amber-200 text-amber-700'
          }
        >
          {item.level === 'confirmed' ? 'ยืนยันแล้ว' : 'เคสคล้ายกัน'}
        </Badge>
        <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 tabular-nums">
          {item.score.toFixed(2)}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{item.snippet}</p>
    </div>
  )
}

export function KnowledgeView() {
  const user = useAppStore((s) => s.user)
  const docs = useAppStore((s) => s.docs)
  const docsLoading = useAppStore((s) => s.docsLoading)
  const lastImport = useAppStore((s) => s.lastImport)
  const loadDocs = useAppStore((s) => s.loadDocs)
  const importDocs = useAppStore((s) => s.importDocs)
  const updateDoc = useAppStore((s) => s.updateDoc)
  const deleteDoc = useAppStore((s) => s.deleteDoc)
  const isAdmin = user?.role === 'admin'

  // โหลดรายการเอกสารเมื่อเปิดหน้า (โหลดซ้ำได้ปลอดภัย)
  useEffect(() => {
    void loadDocs()
  }, [loadDocs])

  // --- ทดลองค้นหา ---
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Citation[] | null>(null)
  const [searchMs, setSearchMs] = useState(0)

  async function runSearch() {
    const query = q.trim()
    if (!query || searching) return
    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('ค้นหาไม่สำเร็จ')
      const j = (await res.json()) as SearchRes
      setResults(j.results ?? [])
      setSearchMs(j.ms ?? 0)
    } catch {
      toast.error('ค้นหาไม่สำเร็จ ลองอีกครั้ง')
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  // --- นำเข้าไฟล์ (เฉพาะแอดมิน) ---
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importReportVisible, setImportReportVisible] = useState(true)

  async function onImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setImporting(true)
    setImportReportVisible(true)
    try {
      await importDocs(Array.from(files))
      const li = useAppStore.getState().lastImport
      if (!li) toast.error('นำเข้าไม่สำเร็จ ตรวจสอบรูปแบบไฟล์แล้วลองอีกครั้ง')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // --- ดูรายละเอียดเอกสาร (chunks) ---
  const [viewId, setViewId] = useState<string | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewData, setViewData] = useState<DocDetailRes | null>(null)

  useEffect(() => {
    if (!viewId) {
      setViewData(null)
      return
    }
    let alive = true
    setViewLoading(true)
    setViewData(null)
    void (async () => {
      try {
        const res = await fetch(`/api/docs/${viewId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('โหลดเอกสารไม่สำเร็จ')
        const j = (await res.json()) as DocDetailRes
        if (alive) setViewData(j)
      } catch {
        if (alive) toast.error('โหลดรายละเอียดเอกสารไม่สำเร็จ')
      } finally {
        if (alive) setViewLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [viewId])

  // --- แก้ไขเอกสาร ---
  const [editDoc, setEditDoc] = useState<DocListItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('general')
  const [editStatus, setEditStatus] = useState('published')
  const [savingDoc, setSavingDoc] = useState(false)

  function openEdit(d: DocListItem) {
    setEditDoc(d)
    setEditTitle(d.title)
    setEditCategory(d.category in CATEGORY_LABELS ? d.category : 'other')
    setEditStatus(d.status)
  }

  async function handleEditSave() {
    if (!editDoc || savingDoc) return
    setSavingDoc(true)
    try {
      await updateDoc(editDoc.id, {
        title: editTitle.trim() || editDoc.title,
        category: editCategory,
        status: editStatus,
      })
      toast.success('บันทึกการแก้ไขแล้ว')
      setEditDoc(null)
    } catch {
      toast.error('บันทึกการแก้ไขไม่สำเร็จ')
    } finally {
      setSavingDoc(false)
    }
  }

  // --- ลบเอกสาร ---
  async function handleDelete(id: string) {
    try {
      await deleteDoc(id)
      toast.success('ลบเอกสารแล้ว')
    } catch {
      toast.error('ลบเอกสารไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {/* 1) หัวหน้า + ปุ่มนำเข้า (เฉพาะแอดมิน) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">คลังความรู้</h2>
          <p className="text-sm text-muted-foreground">เอกสารทั้งหมดที่ใช้ค้นหาและอ้างอิงในการตอบ</p>
        </div>
        {isAdmin && (
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={IMPORT_ACCEPT}
              className="hidden"
              onChange={(e) => void onImportFiles(e.target.files)}
            />
            <Button
              className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              นำเข้าไฟล์
            </Button>
          </div>
        )}
      </div>

      {/* 2) ทดลองค้นหา */}
      <Card className="space-y-3 p-4">
        <Label htmlFor="search-tester">ทดลองค้นหา</Label>
        <div className="flex gap-2">
          <Input
            id="search-tester"
            className="h-11"
            placeholder="พิมพ์คำค้น เช่น ใบเสนอราคา, เปิดเคส…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
            }}
          />
          <Button
            className="h-11 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={searching || !q.trim()}
            onClick={() => void runSearch()}
          >
            {searching ? <Loader2 className="animate-spin" /> : <Search />}
            ค้น
          </Button>
        </div>
        {results !== null && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              พบ {results.length} รายการ · {searchMs} ms
            </p>
            {results.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">ไม่พบผลลัพธ์</p>
            ) : (
              <div className="scroll-thin max-h-72 space-y-2 overflow-y-auto pr-1">
                {results.map((r) => (
                  <CitationRow key={r.id} item={r} />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 3) รายงานผลการนำเข้า */}
      {lastImport && importReportVisible && (
        <Card className="border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-emerald-800">
                นำเข้าสำเร็จ {lastImport.imported} · ข้าม {lastImport.skipped} · ล้มเหลว{' '}
                {lastImport.failed} · {lastImport.ms} ms
              </p>
              <p className="mt-1 text-xs text-emerald-700">ดูสถานะรายไฟล์ในตารางด้านล่าง</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-emerald-700 hover:text-emerald-800"
              title="ปิดรายงาน"
              onClick={() => setImportReportVisible(false)}
            >
              <X />
            </Button>
          </div>
        </Card>
      )}

      {/* 4) รายการเอกสาร */}
      {docsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : docs.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <FolderOpen className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            ยังไม่มีเอกสารในคลัง — นำเข้าไฟล์ ZIP/Markdown/CSV/XLSX/JSON เพื่อเริ่มต้น
          </p>
        </Card>
      ) : (
        <div className="scroll-thin max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {docs.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate font-medium">{d.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={d.status} />
                    <Badge variant="outline">{CATEGORY_LABELS[d.category] ?? d.category}</Badge>
                    <Badge variant="secondary">{d.sourceType}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {d.chunkCount} ชิ้นความรู้
                    </span>
                  </div>
                  {d.source && (
                    <p className="truncate text-xs text-muted-foreground" title={d.source}>
                      แหล่งที่มา: {d.source}
                    </p>
                  )}
                  {d.note && <p className="text-xs text-amber-700">{d.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    อัปเดต {new Date(d.updatedAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 sm:size-9"
                      title="ดูเนื้อหา"
                      onClick={() => setViewId(d.id)}
                    >
                      <Eye />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 sm:size-9"
                      title="แก้ไขเอกสาร"
                      onClick={() => openEdit(d)}
                    >
                      <Pencil />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 text-red-600 hover:text-red-700 sm:size-9"
                          title="ลบเอกสาร"
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ลบเอกสารนี้?</AlertDialogTitle>
                          <AlertDialogDescription>
                            จะลบ &quot;{d.title}&quot; และชิ้นความรู้ทั้งหมดออกจากคลัง
                            การกระทำนี้ย้อนกลับไม่ได้
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => void handleDelete(d.id)}
                          >
                            ลบ
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ไดอะล็อก: ดูเนื้อหาเอกสาร */}
      <Dialog open={viewId !== null} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewData?.doc.title ?? 'กำลังโหลด…'}</DialogTitle>
            <DialogDescription>
              {viewData ? `${viewData.chunks.length} ชิ้นความรู้` : 'กำลังดึงเนื้อหาจากเซิร์ฟเวอร์…'}
            </DialogDescription>
          </DialogHeader>
          {viewLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> กำลังโหลด…
            </div>
          ) : viewData ? (
            <div className="scroll-thin max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {viewData.chunks.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  เอกสารนี้ยังไม่มีชิ้นความรู้
                </p>
              ) : (
                viewData.chunks.map((c) => (
                  <div key={c.id} className="space-y-1 rounded-lg border p-3">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="tabular-nums">
                        #{c.idx}
                      </Badge>
                      {c.heading && <Badge variant="outline">{c.heading}</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{c.content}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">โหลดเนื้อหาไม่สำเร็จ</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ไดอะล็อก: แก้ไขเอกสาร */}
      <Dialog open={editDoc !== null} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขเอกสาร</DialogTitle>
            <DialogDescription className="truncate">{editDoc?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">ชื่อเอกสาร</Label>
              <Input
                id="doc-title"
                className="h-11"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>หมวดหมู่</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>สถานะ</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">เผยแพร่</SelectItem>
                  <SelectItem value="review">รอตรวจสอบ</SelectItem>
                  <SelectItem value="error">ผิดพลาด</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11" onClick={() => setEditDoc(null)}>
              ยกเลิก
            </Button>
            <Button
              className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={savingDoc}
              onClick={() => void handleEditSave()}
            >
              {savingDoc && <Loader2 className="animate-spin" />}
              บันทึก
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
