import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { GeistMono } from 'geist/font/mono'
import { DEMO_MODE } from '@/lib/demo/mode'
import { DemoBanner } from '@/components/demo-banner'
import './globals.css'
import { connection } from 'next/server'

const inter = localFont({ src: '../public/design/inter.woff2', variable: '--font-inter', weight: '400 800', display: 'swap' })
const jakarta = localFont({ src: '../public/design/jakarta.woff2', variable: '--font-jakarta', weight: '400 800', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'FastPass', template: '%s · FastPass' },
  description: 'Venta y validación de entradas para eventos.',
  icons: {
    icon: { url: '/brand/fastpass-app-icon-v2.png', type: 'image/png' },
    apple: { url: '/brand/fastpass-app-icon-v2.png', type: 'image/png' },
  },
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  await connection() // Required for per-request CSP nonces; no static HTML reuse.
  return (
    <html lang="es" className={`dark ${inter.variable} ${jakarta.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {DEMO_MODE && <DemoBanner />}
        {children}
      </body>
    </html>
  )
}
