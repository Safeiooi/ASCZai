'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Database,
  Gauge,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AdminView } from '@/components/app/admin-view'
import { ChatView } from '@/components/app/chat-view'
import { KnowledgeView } from '@/components/app/knowledge-view'
import { LoginView } from '@/components/app/login-view'
import { useAppStore } from '@/components/app/store'
import type { AppView } from '@/components/app/types'
import { cn } from '@/lib/utils'

interface NavItem {
  id: AppView
  label: string
  icon: LucideIcon
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat', label: 'แชท', icon: MessageSquare },
  { id: 'knowledge', label: 'คลังความรู้', icon: Database },
  { id: 'admin', label: 'ผู้ดูแลระบบ', icon: ShieldCheck, adminOnly: true },
]

/** สแปลชช่วง boot — เร็ว ไม่บล็อก (boot ทำงานอยู่เบื้องหลังใน providers) */
function Splash() {
  const bootError = useAppStore((s) => s.bootError)
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
        <ShieldCheck className="size-9" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">ASC Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">ผู้ช่วยความรู้ AI สำหรับทีม ASC</p>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> กำลังเริ่มระบบ…
      </p>
      {bootError && <p className="max-w-xs text-center text-xs text-red-600 dark:text-red-400">{bootError}</p>}
    </main>
  )
}

function AdminDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <Card className="flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <ShieldCheck className="size-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold">เฉพาะผู้ดูแลระบบเท่านั้น</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หากคิดว่าไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          กลับไปหน้าแชท
        </Button>
      </Card>
    </div>
  )
}

/** ดูรูปแนบแบบเต็มจอ — ปิดด้วยคลิกพื้นหลังหรือปุ่ม X */
function ImageViewerOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูปภาพแนบ"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <img
        src={url}
        alt="รูปภาพแนบ"
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="ปิดหน้าต่างรูปภาพ"
        className="absolute right-3 top-3 size-10 rounded-full bg-white/90 text-black hover:bg-white"
        onClick={onClose}
      >
        <X className="size-5" />
      </Button>
    </div>
  )
}

function AppFooter() {
  return (
    <footer className="mt-auto w-full border-t bg-background px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className="flex w-full flex-col items-center justify-between gap-0.5 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
        <span>ASC Hub · ผู้ช่วยความรู้ภายในทีม ASC</span>
        <span>ข้อมูลอ้างอิงจากคลังความรู้ทีม</span>
      </div>
    </footer>
  )
}

export function AppRoot() {
  const booted = useAppStore((s) => s.booted)
  const user = useAppStore((s) => s.user)
  const view = useAppStore((s) => s.view)
  const imageViewer = useAppStore((s) => s.imageViewer)
  const quota = useAppStore((s) => s.quota)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setView = useAppStore((s) => s.setView)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const setImageViewer = useAppStore((s) => s.setImageViewer)
  const logout = useAppStore((s) => s.logout)

  // ---------- 1) กำลัง boot ----------
  if (!booted) {
    return (
      <div className="flex min-h-screen flex-col">
        <Splash />
      </div>
    )
  }

  // ---------- 2) ยังไม่เข้าสู่ระบบ ----------
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
          <LoginView />
        </main>
        <AppFooter />
      </div>
    )
  }

  // ---------- 3) เข้าสู่ระบบแล้ว ----------
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin')
  const quotaNearLimit = quota.limit > 0 && quota.used / quota.limit >= 0.8

  const renderView = () => {
    if (view === 'chat') return <ChatView />
    if (view === 'knowledge')
      return (
        <div className="scroll-thin min-h-0 w-full flex-1 overflow-y-auto">
          <KnowledgeView />
        </div>
      )
    // view === 'admin'
    if (user.role !== 'admin') return <AdminDenied onBack={() => setView('chat')} />
    return (
      <div className="scroll-thin min-h-0 w-full flex-1 overflow-y-auto">
        <AdminView />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-1.5 px-3 sm:px-4">
          {/* เมนูมือถือ */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 md:hidden"
                aria-label="เปิดเมนู"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-5 text-emerald-600" /> ASC Hub
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-3">
                {navItems.map((item) => {
                  const active = view === item.id
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-11 w-full justify-start gap-3',
                        active
                          ? 'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'text-muted-foreground',
                      )}
                      onClick={() => setView(item.id)}
                    >
                      <item.icon className="size-4" /> {item.label}
                    </Button>
                  )
                })}
                <Separator className="my-2" />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full justify-start gap-3 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400"
                  onClick={() => void logout()}
                >
                  <LogOut className="size-4" /> ออกจากระบบ
                </Button>
              </nav>
            </SheetContent>
          </Sheet>

          {/* แบรนด์ */}
          <button
            type="button"
            onClick={() => setView('chat')}
            aria-label="ASC Hub — ไปหน้าแชท"
            className="flex items-center gap-2 rounded-md px-1 py-1.5 text-left"
          >
            <ShieldCheck className="size-6 shrink-0 text-emerald-600" />
            <span className="text-base font-bold tracking-tight">ASC Hub</span>
          </button>

          {/* แท็บนำทาง (เดสก์ท็อป) */}
          <nav aria-label="เมนูหลัก" className="ml-3 hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = view === item.id
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-9 gap-2 px-3',
                    active
                      ? 'bg-emerald-50 font-medium text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 dark:hover:text-emerald-300'
                      : 'text-muted-foreground',
                  )}
                  onClick={() => setView(item.id)}
                >
                  <item.icon className="size-4" /> {item.label}
                </Button>
              )
            })}
          </nav>

          {/* โควตา + ผู้ใช้ */}
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              title="โควตาคำถามวันนี้"
              className={cn(
                'hidden gap-1.5 px-2.5 py-1 font-normal sm:inline-flex',
                quotaNearLimit &&
                  'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
              )}
            >
              <Gauge className="size-3.5" />
              {quota.used}/{quota.limit} คำถามวันนี้
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" className="h-10 gap-2 px-2 md:h-9">
                  <span className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    <User className="size-4" />
                  </span>
                  <span className="hidden max-w-[140px] truncate text-sm md:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-700 dark:text-red-400" onClick={() => void logout()}>
                  <LogOut className="size-4" /> ออกจากระบบ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* เนื้อหาหลักตาม view */}
      <main className="flex min-h-0 w-full flex-1 flex-col">{renderView()}</main>

      <AppFooter />

      {imageViewer && <ImageViewerOverlay url={imageViewer} onClose={() => setImageViewer(null)} />}
    </div>
  )
}
