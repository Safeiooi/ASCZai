'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from './store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import type { SettingsRes } from './types'

interface SettingsForm {
  ai: {
    enabled: boolean
    dailyQuota: string
    timeoutMs: string
    contextChunks: string
    activeProvider: string
  }
  openai: {
    label: string
    baseURL: string
    apiKey: string
    model: string
    supportsVision: boolean
  }
  ollama: {
    label: string
    baseURL: string
    model: string
    supportsVision: boolean
  }
}

function deriveForm(settings: SettingsRes): SettingsForm {
  return {
    ai: {
      enabled: settings.ai.enabled,
      dailyQuota: String(settings.ai.dailyQuota),
      timeoutMs: String(settings.ai.timeoutMs),
      contextChunks: String(settings.ai.contextChunks),
      activeProvider: settings.ai.activeProvider,
    },
    openai: { ...settings.providers.openai },
    ollama: { ...settings.providers.ollama },
  }
}

export function SettingsTab() {
  const settings = useAppStore((s) => s.settings)

  if (!settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // key จากเนื้อหา settings เพื่อรีเซ็ตฟอร์มให้ตรงค่าล่าสุดจากเซิร์ฟเวอร์ (เช่นหลังบันทึกสำเร็จ)
  return <SettingsForm key={JSON.stringify(settings)} settings={settings} />
}

function SettingsForm({ settings }: { settings: SettingsRes }) {
  const saveSettings = useAppStore((s) => s.saveSettings)
  const [form, setForm] = useState<SettingsForm>(() => deriveForm(settings))
  const [saving, setSaving] = useState(false)

  const updAi = (patch: Partial<SettingsForm['ai']>) =>
    setForm((f) => (f ? { ...f, ai: { ...f.ai, ...patch } } : f))
  const updOpenai = (patch: Partial<SettingsForm['openai']>) =>
    setForm((f) => (f ? { ...f, openai: { ...f.openai, ...patch } } : f))
  const updOllama = (patch: Partial<SettingsForm['ollama']>) =>
    setForm((f) => (f ? { ...f, ollama: { ...f.ollama, ...patch } } : f))

  async function handleSave() {
    if (!form || saving) return
    setSaving(true)
    const err = await saveSettings({
      ai: {
        enabled: form.ai.enabled,
        dailyQuota: Math.max(0, Math.floor(Number(form.ai.dailyQuota) || 0)),
        timeoutMs: Math.max(1000, Math.floor(Number(form.ai.timeoutMs) || 60000)),
        contextChunks: Math.min(20, Math.max(1, Math.floor(Number(form.ai.contextChunks) || 5))),
        activeProvider: form.ai.activeProvider,
      },
      providers: {
        openai: {
          label: form.openai.label,
          baseURL: form.openai.baseURL.trim(),
          apiKey: form.openai.apiKey,
          model: form.openai.model.trim(),
          supportsVision: form.openai.supportsVision,
        },
        ollama: {
          label: form.ollama.label,
          baseURL: form.ollama.baseURL.trim(),
          model: form.ollama.model.trim(),
          supportsVision: form.ollama.supportsVision,
        },
      },
    })
    setSaving(false)
    if (err) {
      toast.error(err)
      return
    }
    toast.success('บันทึกแล้ว')
  }

  return (
    <div className="space-y-4">
      {/* การทำงานของ AI */}
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">การทำงานของ AI</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="ai-enabled">เปิดใช้งาน AI</Label>
            <p className="text-xs text-muted-foreground">ปิดเมื่อไหร่ ผู้ใช้จะใช้ได้เฉพาะการค้นหาเอกสาร</p>
          </div>
          <Switch
            id="ai-enabled"
            checked={form.ai.enabled}
            onCheckedChange={(v) => updAi({ enabled: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-quota">โควต้าคำถามต่อคน/วัน</Label>
            <Input
              id="ai-quota"
              className="h-11"
              type="number"
              min={0}
              value={form.ai.dailyQuota}
              onChange={(e) => updAi({ dailyQuota: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-timeout">เวลารอโมเดลสูงสุด (มิลลิวินาที)</Label>
            <Input
              id="ai-timeout"
              className="h-11"
              type="number"
              min={1000}
              step={1000}
              value={form.ai.timeoutMs}
              onChange={(e) => updAi({ timeoutMs: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-chunks">จำนวนหลักฐานส่งเข้าโมเดล (1-20)</Label>
            <Input
              id="ai-chunks"
              className="h-11"
              type="number"
              min={1}
              max={20}
              value={form.ai.contextChunks}
              onChange={(e) => updAi({ contextChunks: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>ผู้ให้บริการโมเดลหลัก</Label>
            <Select value={form.ai.activeProvider} onValueChange={(v) => updAi({ activeProvider: v })}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zai">ZAI (GLM) — ใช้ได้ในระบบ</SelectItem>
                <SelectItem value="openai">OpenAI-Compatible</SelectItem>
                <SelectItem value="ollama">Ollama (local)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* OpenAI-Compatible */}
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">OpenAI-Compatible</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="openai-label">ชื่อแสดงผล</Label>
            <Input
              id="openai-label"
              className="h-11"
              value={form.openai.label}
              onChange={(e) => updOpenai({ label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-model">ชื่อโมเดล</Label>
            <Input
              id="openai-model"
              className="h-11"
              placeholder="openai/gpt-4o-mini"
              value={form.openai.model}
              onChange={(e) => updOpenai({ model: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="openai-base">Base URL</Label>
            <Input
              id="openai-base"
              className="h-11"
              placeholder="https://openrouter.ai/api/v1"
              value={form.openai.baseURL}
              onChange={(e) => updOpenai({ baseURL: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="openai-key">API Key</Label>
            <Input
              id="openai-key"
              className="h-11"
              type="password"
              placeholder="•••••••• หมายถึงคงคีย์เดิม"
              value={form.openai.apiKey}
              onChange={(e) => updOpenai({ apiKey: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              แสดงแบบปิดบังเพื่อความปลอดภัย — พิมพ์ใหม่เพื่อเปลี่ยน
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="openai-vision" className="font-normal">
            รองรับวิเคราะห์รูปภาพ
          </Label>
          <Switch
            id="openai-vision"
            checked={form.openai.supportsVision}
            onCheckedChange={(v) => updOpenai({ supportsVision: v })}
          />
        </div>
      </Card>

      {/* Ollama */}
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Ollama (ท้องถิ่น)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ollama-label">ชื่อแสดงผล</Label>
            <Input
              id="ollama-label"
              className="h-11"
              value={form.ollama.label}
              onChange={(e) => updOllama({ label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ollama-model">ชื่อโมเดล</Label>
            <Input
              id="ollama-model"
              className="h-11"
              placeholder="llama3.2-vision"
              value={form.ollama.model}
              onChange={(e) => updOllama({ model: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ollama-base">Base URL</Label>
            <Input
              id="ollama-base"
              className="h-11"
              placeholder="http://127.0.0.1:11434/v1"
              value={form.ollama.baseURL}
              onChange={(e) => updOllama({ baseURL: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="ollama-vision" className="font-normal">
            รองรับวิเคราะห์รูปภาพ
          </Label>
          <Switch
            id="ollama-vision"
            checked={form.ollama.supportsVision}
            onCheckedChange={(v) => updOllama({ supportsVision: v })}
          />
        </div>
      </Card>

      {/* แถบบันทึกแบบติดหน้าจอ */}
      <div className="sticky bottom-4 z-10">
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            คีย์ API เก็บฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งกลับแบบเปิดเผย
          </p>
          <Button
            className="h-11 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving && <Loader2 className="animate-spin" />}
            บันทึกการตั้งค่า
          </Button>
        </Card>
      </div>
    </div>
  )
}
