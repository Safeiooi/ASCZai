import type { ChatMessage } from '@/lib/types'

export * from '@/lib/types'

/** ข้อความฝั่งหน้าจอ (เพิ่มสถานะชั่วคราวขณะ stream) */
export interface UiMessage extends ChatMessage {
  status?: 'sending' | 'streaming' | 'done' | 'error'
  statusLine?: string | null
  timingLine?: string
}

/** รูปที่เลือกแนบแล้วรอส่ง (ฝั่ง client) */
export interface PendingImage {
  name: string
  dataUrl: string
  mime: string
  size: number
}

export type AppView = 'chat' | 'knowledge' | 'admin'

export const SUGGESTED_QUESTIONS = [
  'สร้างใบเสนอราคาไม่ได้ ต้องตรวจอะไรก่อน',
  'ขั้นตอนเปิดเคสใหม่ในระบบเป็นอย่างไร',
  'สรุปขั้นตอนอัปเดตข้อมูลในคลังความรู้',
]
