import type { Metadata, Viewport } from 'next'
import './style.css'
export const metadata: Metadata = {
  title: 'Chicago Companion | Your Chicago getaway',
  description: 'Your personal Chicago road trip planner',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Chicago Companion',
    statusBarStyle: 'default',
  },
  icons: { apple: '/icon-192.png' },
}
export const viewport: Viewport = { themeColor: '#f7f8fc' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
