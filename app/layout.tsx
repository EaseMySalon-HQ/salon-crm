import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/lib/auth-context"
import { AdminAuthProvider } from "@/lib/admin-auth-context"
import { CookieConsentBanner } from "@/components/gdpr/cookie-consent-banner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Ease My Salon",
  description: "Manage your salon with ease.",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AuthProvider>
          <AdminAuthProvider>
            {children}
            <Toaster />
            <CookieConsentBanner />
          </AdminAuthProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
