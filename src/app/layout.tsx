import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/components/app/providers'

export const metadata: Metadata = {
  title: 'ASC Hub — ผู้ช่วยความรู้ AI สำหรับทีม ASC',
  description:
    'รวมความรู้ ค้นหา วิเคราะห์ปัญหา และช่วยเจ้าหน้าที่สนับสนุนผู้ใช้ PEAK พร้อมหลักฐานอ้างอิงที่เปิดดูได้จริง',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  )
}
