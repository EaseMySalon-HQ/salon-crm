"use client"

import { useEffect, useState } from "react"
import { MessageCircle, PhoneCall, X } from "lucide-react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"

export function FloatingCTA() {
  const [visible, setVisible] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Only show on public pages
    const isPublicPage = pathname && !pathname.startsWith('/dashboard') && 
      !pathname.startsWith('/appointments') && 
      !pathname.startsWith('/clients') && 
      !pathname.startsWith('/products') && 
      !pathname.startsWith('/services') && 
      !pathname.startsWith('/staff') && 
      !pathname.startsWith('/reports') && 
      !pathname.startsWith('/analytics') && 
      !pathname.startsWith('/cash-registry') && 
      !pathname.startsWith('/quick-sale') && 
      !pathname.startsWith('/settings') && 
      !pathname.startsWith('/profile') && 
      !pathname.startsWith('/users') && 
      !pathname.startsWith('/admin') && 
      pathname !== '/login'

    if (!isPublicPage) {
      return
    }

    let lastScrollY = window.scrollY
    const handleScroll = () => {
      const scrollY = window.scrollY
      const direction = scrollY > lastScrollY ? "down" : "up"
      
      // Show on scroll up, hide on scroll down (after 100px)
      if (direction === "down" && scrollY > 100) {
        setVisible(false)
      } else {
        setVisible(true)
      }
      
      lastScrollY = scrollY > 0 ? scrollY : 0
    }
    
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [pathname])

  // Only show on public pages
  const isPublicPage = pathname && !pathname.startsWith('/dashboard') && 
    !pathname.startsWith('/appointments') && 
    !pathname.startsWith('/clients') && 
    !pathname.startsWith('/products') && 
    !pathname.startsWith('/services') && 
    !pathname.startsWith('/staff') && 
    !pathname.startsWith('/reports') && 
    !pathname.startsWith('/analytics') && 
    !pathname.startsWith('/cash-registry') && 
    !pathname.startsWith('/quick-sale') && 
    !pathname.startsWith('/settings') && 
    !pathname.startsWith('/profile') && 
    !pathname.startsWith('/users') && 
    !pathname.startsWith('/admin') && 
    pathname !== '/login'

  if (!isPublicPage) {
    return null
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="icon"
          className={`rounded-full h-14 w-14 bg-[#25D366] hover:bg-[#20BA5A] text-white shadow-2xl shadow-emerald-500/50 transition-all transform hover:scale-110 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
          onClick={() => setShowChat((prev) => !prev)}
          aria-label="Open WhatsApp chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>

      {showChat && (
        <div className="fixed bottom-6 left-6 z-50 w-96 rounded-3xl border-2 border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white rounded-t-3xl px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-base font-bold">Ease My Salon Concierge</p>
              <p className="text-xs text-purple-100 mt-0.5">⚡ Replies in under 5 minutes</p>
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-900">Hi! 👋 Ready to transform your salon?</p>
              <p className="text-sm text-slate-600">Get a free personalized demo. We'll show you exactly how Ease My Salon can help your business grow.</p>
            </div>
            <div className="space-y-3 pt-2">
              <Button asChild className="w-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold shadow-lg">
                <a href="https://wa.me/917091140602?text=Hi%20Ease%20My%20Salon!%20I%27d%20love%20to%20book%20a%20free%20demo." target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat on WhatsApp Now
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full border-2">
                <a href="tel:+917091140602">
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Call: +91 70911 40602
                </a>
              </Button>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 text-center">
                ✓ Free consultation • ✓ No obligation • ✓ Get started in 1 day
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

