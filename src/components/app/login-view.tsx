'use client'

import { useState } from 'react'
import { CircleAlert, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/components/app/store'

export function LoginView() {
  const login = useAppStore((s) => s.login)
  const bootError = useAppStore((s) => s.bootError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    const err = await login(email.trim(), password)
    if (err) setError(err)
    setLoading(false)
  }

  const alertText = error ?? bootError

  return (
    <Card className="w-full max-w-sm p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
          <ShieldCheck className="size-7" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">ASC Hub</h1>
        <p className="text-sm text-muted-foreground">ผู้ช่วยความรู้ AI สำหรับทีม ASC</p>
      </div>

      {alertText && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{alertText}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">อีเมล</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@asc.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">รหัสผ่าน</Label>
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="mt-1 h-11 w-full bg-emerald-600 text-base font-medium text-white hover:bg-emerald-700"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> กำลังตรวจสอบ…
            </>
          ) : (
            'เข้าสู่ระบบ'
          )}
        </Button>
      </form>

      <div className="mt-4 rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
        ทดลองเข้าใช้: <span className="font-mono">admin@asc.local / aschub1234</span>
      </div>
    </Card>
  )
}
