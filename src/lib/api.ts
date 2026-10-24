import { NextResponse } from 'next/server'

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function unauthorized() {
  return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 })
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function notFound(message = 'ไม่พบรายการ') {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function serverError(message = 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์') {
  return NextResponse.json({ error: message }, { status: 500 })
}
