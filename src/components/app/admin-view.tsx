'use client'

import { useEffect, type ReactNode } from 'react'
import {
  Database,
  FileText,
  LayoutDashboard,
  MessageCircleQuestion,
  MessageSquareHeart,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react'
import { useAppStore } from './store'
import { SettingsTab } from './settings-tab'
import { UsersTab } from './users-tab'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-emerald-700">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString('th-TH')}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export function AdminView() {
  const user = useAppStore((s) => s.user)
  const overview = useAppStore((s) => s.overview)
  const loadOverview = useAppStore((s) => s.loadOverview)
  const loadUsers = useAppStore((s) => s.loadUsers)
  const loadSettings = useAppStore((s) => s.loadSettings)

  useEffect(() => {
    void loadOverview()
    void loadUsers()
    void loadSettings()
  }, [loadOverview, loadUsers, loadSettings])

  if (user?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <Card className="p-8 text-center">
          <p className="text-sm font-medium">เฉพาะผู้ดูแลระบบเท่านั้น</p>
          <p className="mt-1 text-sm text-muted-foreground">
            คุณไม่มีสิทธิ์เข้าถึงหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์
          </p>
        </Card>
      </div>
    )
  }

  const stats = overview?.stats ?? null

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h2 className="text-xl font-semibold">ผู้ดูแลระบบ</h2>
        <p className="text-sm text-muted-foreground">ภาพรวมระบบ ฟีดแบ็ก ผู้ใช้งาน และการตั้งค่า AI</p>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-11 w-full justify-start overflow-x-auto sm:h-10 sm:w-fit">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard /> ภาพรวม
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5">
            <MessageSquareHeart /> ฟีดแบ็ก
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users /> ผู้ใช้
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 /> ตั้งค่า AI
          </TabsTrigger>
        </TabsList>

        {/* ภาพรวม */}
        <TabsContent value="overview" className="space-y-4">
          {!stats ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  icon={<FileText className="size-4" />}
                  label="เอกสาร"
                  value={stats.docs}
                  sub={`เผยแพร่ ${stats.publishedDocs} · รอตรวจ ${stats.reviewDocs} · ผิดพลาด ${stats.errorDocs}`}
                />
                <StatCard icon={<Database className="size-4" />} label="ชิ้นความรู้" value={stats.chunks} />
                <StatCard icon={<Users className="size-4" />} label="ผู้ใช้" value={stats.users} />
                <StatCard
                  icon={<MessageCircleQuestion className="size-4" />}
                  label="คำถามวันนี้"
                  value={stats.todayQueries}
                />
              </div>
              <Card className="flex items-center gap-4 p-4">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="size-4 text-emerald-600" />
                  <span className="text-sm text-muted-foreground">ชอบ</span>
                  <span className="font-semibold tabular-nums">{stats.feedbackUp.toLocaleString('th-TH')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ThumbsDown className="size-4 text-red-600" />
                  <span className="text-sm text-muted-foreground">ไม่ชอบ</span>
                  <span className="font-semibold tabular-nums">{stats.feedbackDown.toLocaleString('th-TH')}</span>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  รวม {(stats.feedbackUp + stats.feedbackDown).toLocaleString('th-TH')} รายการ
                </span>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ฟีดแบ็ก */}
        <TabsContent value="feedback" className="space-y-4">
          {!overview ? (
            <div className="space-y-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : overview.feedbacks.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีฟีดแบ็ก</Card>
          ) : (
            <div className="scroll-thin max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {overview.feedbacks.map((f) => (
                <Card key={f.id} className="space-y-1.5 p-4">
                  <div className="flex items-center gap-2">
                    {f.rating === 'up' ? (
                      <ThumbsUp className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <ThumbsDown className="size-4 shrink-0 text-red-600" />
                    )}
                    <span className="text-sm font-medium">{f.userName}</span>
                    {f.rating === 'up' ? (
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">ชอบ</Badge>
                    ) : (
                      <Badge className="border-red-200 bg-red-100 text-red-700">ไม่ชอบ</Badge>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {new Date(f.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  {f.comment && <p className="text-sm">{f.comment}</p>}
                  {f.messageContent && (
                    <p className="text-sm text-muted-foreground">{truncate(f.messageContent, 160)}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ผู้ใช้ */}
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        {/* ตั้งค่า AI */}
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
