'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'
import { useAppStore } from '@/components/app/store'

export function Providers({ children }: { children: React.ReactNode }) {
  const boot = useAppStore((s) => s.boot)
  useEffect(() => {
    void boot()
  }, [boot])
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  )
}
