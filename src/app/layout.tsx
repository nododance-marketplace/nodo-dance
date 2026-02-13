import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { MobileNav } from '@/components/layout/mobile-nav'
import { SessionProvider } from '@/components/providers/session-provider'
import { Toaster } from 'sonner'

const satoshi = localFont({
  src: [
    {
      path: '../../public/fonts/satoshi/Satoshi-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/satoshi/Satoshi-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/satoshi/Satoshi-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-satoshi',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nodo Dance - Charlotte\'s Partner Dance Hub',
  description: 'Find dance instructors and events in Charlotte, NC. Salsa, Bachata, Kizomba, Tango, and Zouk.',
  manifest: '/manifest.json',
  themeColor: '#1B1F3B',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Nodo Dance',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${satoshi.variable} font-sans`}>
        <SessionProvider>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 pb-20 md:pb-0">{children}</main>
            <Footer />
            <MobileNav />
          </div>
          <Toaster position="top-right" richColors />
        </SessionProvider>
      </body>
    </html>
  )
}
