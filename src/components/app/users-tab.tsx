'use client'

import { useState } from 'react'
import { Loader2, Pencil, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from './store'
import type { UserItem } from './types'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type RoleChoice = 'admin' | 'user'

function RoleBadge({ role }: { role: RoleChoice }) {
  if (role === 'admin') {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">ผู้ดูแลระบบ</Badge>
    )
  }
  return <Badge variant="outline">ผู้ใช้งาน</Badge>
}

function StatusCell({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className="size-2 rounded-full bg-emerald-500" />
        ใช้งาน
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
      <span className="size-2 rounded-full bg-red-500" />
      ปิดใช้งาน
    </span>
  )
}

export function UsersTab() {
  const me = useAppStore((s) => s.user)
  const users = useAppStore((s) => s.users)
  const createUser = useAppStore((s) => s.createUser)
  const updateUser = useAppStore((s) => s.updateUser)
  const deleteUser = useAppStore((s) => s.deleteUser)

  // --- เพิ่มผู้ใช้ ---
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<{ email: string; name: string; password: string; role: RoleChoice }>({
    email: '',
    name: '',
    password: '',
    role: 'user',
  })
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (creating) return
    if (!createForm.email.trim()) {
      toast.error('กรุณากรอกอีเมล')
      return
    }
    if (createForm.password.length < 8) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    setCreating(true)
    const err = await createUser({
      email: createForm.email.trim(),
      name: createForm.name.trim(),
      password: createForm.password,
      role: createForm.role,
    })
    setCreating(false)
    if (err) {
      toast.error(err)
      return
    }
    toast.success('เพิ่มผู้ใช้แล้ว')
    setCreateOpen(false)
    setCreateForm({ email: '', name: '', password: '', role: 'user' })
  }

  // --- แก้ไขผู้ใช้ ---
  const [editUser, setEditUser] = useState<UserItem | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; role: RoleChoice; status: string; password: string }>({
    name: '',
    role: 'user',
    status: 'active',
    password: '',
  })
  const [saving, setSaving] = useState(false)

  function openEdit(u: UserItem) {
    setEditUser(u)
    setEditForm({
      name: u.name ?? '',
      role: u.role,
      status: u.status === 'disabled' ? 'disabled' : 'active',
      password: '',
    })
  }

  async function handleEditSave() {
    if (!editUser || saving) return
    if (editForm.password && editForm.password.length < 8) {
      toast.error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    setSaving(true)
    const err = await updateUser(editUser.id, {
      name: editForm.name.trim(),
      role: editForm.role,
      status: editForm.status,
      ...(editForm.password ? { password: editForm.password } : {}),
    })
    setSaving(false)
    if (err) {
      toast.error(err)
      return
    }
    toast.success('บันทึกการแก้ไขแล้ว')
    setEditUser(null)
  }

  // --- ลบผู้ใช้ ---
  async function handleDelete(u: UserItem) {
    const err = await deleteUser(u.id)
    if (err) {
      toast.error(err)
      return
    }
    toast.success('ลบผู้ใช้แล้ว')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">ผู้ใช้งาน</h3>
        <Button
          className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => setCreateOpen(true)}
        >
          <UserPlus />
          เพิ่มผู้ใช้
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีผู้ใช้ในระบบ</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>อีเมล</TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead>สิทธิ์</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">โควต้าวันนี้</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === me?.id
              return (
                <TableRow key={u.id}>
                  <TableCell className="max-w-52 truncate" title={u.email}>
                    {u.email}
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={u.name ?? undefined}>
                    {u.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    <StatusCell status={u.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.quotaUsed}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 sm:size-9"
                        title={isSelf ? 'บัญชีของคุณเอง' : 'แก้ไขผู้ใช้'}
                        disabled={isSelf}
                        onClick={() => openEdit(u)}
                      >
                        <Pencil />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 text-red-600 hover:text-red-700 sm:size-9"
                            title={isSelf ? 'บัญชีของคุณเอง' : 'ลบผู้ใช้'}
                            disabled={isSelf}
                          >
                            <Trash2 />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ลบผู้ใช้นี้?</AlertDialogTitle>
                            <AlertDialogDescription>
                              จะลบบัญชี {u.email} ออกจากระบบ การกระทำนี้ย้อนกลับไม่ได้
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              onClick={() => void handleDelete(u)}
                            >
                              ลบ
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* ไดอะล็อก: เพิ่มผู้ใช้ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้</DialogTitle>
            <DialogDescription>สร้างบัญชีสำหรับเข้าใช้งานระบบ</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-email">อีเมล</Label>
              <Input
                id="new-email"
                className="h-11"
                type="email"
                placeholder="name@asc.local"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">ชื่อ</Label>
              <Input
                id="new-name"
                className="h-11"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">รหัสผ่าน</Label>
              <Input
                id="new-password"
                className="h-11"
                type="password"
                placeholder="อย่างน้อย 8 ตัวอักษร"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>สิทธิ์</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as RoleChoice }))}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">ผู้ใช้งาน</SelectItem>
                  <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setCreateOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating && <Loader2 className="animate-spin" />}
              เพิ่มผู้ใช้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ไดอะล็อก: แก้ไขผู้ใช้ */}
      <Dialog open={editUser !== null} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขผู้ใช้</DialogTitle>
            <DialogDescription className="truncate">{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">ชื่อ</Label>
              <Input
                id="edit-name"
                className="h-11"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>สิทธิ์</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as RoleChoice }))}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">ผู้ใช้งาน</SelectItem>
                  <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>สถานะ</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">ใช้งาน</SelectItem>
                  <SelectItem value="disabled">ปิดใช้งาน</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">รหัสผ่านใหม่ (ไม่บังคับ)</Label>
              <Input
                id="edit-password"
                className="h-11"
                type="password"
                placeholder="••••••••"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">เว้นว่าง = คงรหัสเดิม</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setEditUser(null)}>
              ยกเลิก
            </Button>
            <Button
              className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={saving}
              onClick={() => void handleEditSave()}
            >
              {saving && <Loader2 className="animate-spin" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
