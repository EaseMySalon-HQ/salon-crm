"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle, Shield, Sparkles, TrendingUp } from "lucide-react"

import { LoginForm } from "@/components/auth/login-form"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/hooks/use-toast"
import { consumeSessionExpiredFlag } from "@/lib/auth-utils"

export default function LoginPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    if (!isLoading && user) {
      router.push("/dashboard")
    }
  }, [user, isLoading, router])

  // Show "Session expired" message when redirected after 401/403
  useEffect(() => {
    const fromQuery = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("session_expired") === "1"
    const fromFlag = consumeSessionExpiredFlag()
    if (fromQuery || fromFlag) {
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
      })
      if (fromQuery && typeof window !== "undefined") {
        window.history.replaceState({}, "", "/login")
      }
    }
  }, [toast])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      </div>
    )
  }

  if (user) {
    return null
  }

  const stats = [
    { label: "Active salons", value: "350+" },
    { label: "Cities served", value: "50+" },
    { label: "Faster billing", value: "70%" },
    { label: "Support", value: "24/7" },
  ]

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#312E81]">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -top-16 -left-10 h-96 w-96 rounded-full bg-[#7C3AED]/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-[#A855F7]/30 blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] items-center">
          <div className="text-white space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold tracking-wide shadow-lg shadow-purple-900/30">
              <Sparkles className="h-4 w-4 text-amber-300" />
              Ease My Salon • Trusted Salon OS
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                Modern control centre for every salon workflow.
              </h1>
              <p className="text-lg text-white/80">
                Sign in to orchestrate POS, appointments, inventory, commissions and HQ analytics—all crafted for Indian salons demanding speed and clarity.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "Secure by default", desc: "Role-based access + alerts", icon: Shield },
                { title: "Concierge on standby", desc: "WhatsApp help in minutes", icon: MessageCircle },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                  <item.icon className="h-5 w-5 text-[#7C3AED]" />
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Button asChild size="lg" className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl">
                <Link href="/">Back to home</Link>
              </Button>
              <Button
                variant="outline"
                asChild
                size="lg"
                className="border-2 border-white/60 bg-white/10 text-white hover:bg-white/20 px-8 py-6 h-auto text-lg font-semibold backdrop-blur"
              >
                <Link href="/contact">Need help? Contact Support</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-[32px] bg-gradient-to-br from-[#7C3AED] to-[#A855F7] opacity-40 blur-3xl" />
            <div className="rounded-[32px] border border-white/40 bg-white/95 p-6 shadow-2xl shadow-purple-900/30 backdrop-blur">
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
