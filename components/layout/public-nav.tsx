"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Menu, X, ArrowRight, Sparkles, Zap, TrendingUp, Users, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { cn } from "@/lib/utils"

const marketingLinks = [
  { href: "/features", label: "Features" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
]

export function PublicNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const closeMenu = () => setOpen(false)

  return (
    <header 
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled 
          ? "bg-white/95 backdrop-blur-md shadow-lg shadow-slate-900/5 border-b border-slate-200/50" 
          : "bg-white/80 backdrop-blur-sm border-b border-slate-100"
      )}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <Image
              src="/images/logo-no-background.png"
              alt="Ease My Salon"
              width={150}
              height={40}
              className="object-contain transition-all duration-300 group-hover:scale-105"
              priority
            />
          </Link>

          {/* Desktop Navigation - Radix menu only after mount to avoid hydration mismatch (Radix auto-IDs differ on server vs client) */}
          <nav className="hidden lg:flex items-center gap-1">
            {mounted ? (
              <NavigationMenu>
                <NavigationMenuList className="gap-2">
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="text-sm font-semibold text-slate-700 hover:text-[#7C3AED] data-[state=open]:text-[#7C3AED] transition-colors">
                      Platform
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="p-6 bg-white shadow-2xl rounded-3xl border-2 border-slate-100">
                      <div className="grid gap-6 md:w-[600px] lg:w-[700px] lg:grid-cols-3">
                        <div className="space-y-4 lg:col-span-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#7C3AED]">Core Modules</p>
                          <ul className="space-y-3 text-sm text-slate-700">
                            <li className="flex items-center gap-2 font-medium">
                              <Zap className="h-4 w-4 text-[#7C3AED]" />
                              POS & Billing
                            </li>
                            <li className="flex items-center gap-2 font-medium">
                              <Users className="h-4 w-4 text-[#7C3AED]" />
                              Appointments & CRM
                            </li>
                            <li className="flex items-center gap-2 font-medium">
                              <TrendingUp className="h-4 w-4 text-[#7C3AED]" />
                              Inventory & Stock
                            </li>
                            <li className="flex items-center gap-2 font-medium">
                              <Users className="h-4 w-4 text-[#7C3AED]" />
                              Staff & Payroll
                            </li>
                            <li className="flex items-center gap-2 font-medium">
                              <Sparkles className="h-4 w-4 text-[#7C3AED]" />
                              Reports & HQ Control
                            </li>
                          </ul>
                        </div>
                        <div className="lg:col-span-2 space-y-4">
                          <Link 
                            href="/features" 
                            className="block rounded-2xl border-2 border-slate-100 bg-gradient-to-br from-purple-50 to-indigo-50 p-5 hover:border-[#7C3AED]/30 hover:shadow-lg transition-all group"
                          >
                            <p className="text-base font-bold text-slate-900 group-hover:text-[#7C3AED] transition-colors mb-2">Explore All Features</p>
                            <p className="text-xs text-slate-600 leading-relaxed">Deep dive into every automation and dashboard Ease My Salon unlocks.</p>
                          </Link>
                          <div className="grid gap-3 md:grid-cols-2">
                            <Link 
                              href="/solutions" 
                              className="rounded-2xl border-2 border-slate-100 p-4 hover:border-[#7C3AED]/30 hover:shadow-md transition-all text-sm font-semibold text-slate-700 hover:text-[#7C3AED]"
                            >
                              Salon Playbooks
                            </Link>
                            <Link 
                              href="/pricing" 
                              className="rounded-2xl border-2 border-slate-100 p-4 hover:border-[#7C3AED]/30 hover:shadow-md transition-all text-sm font-semibold text-slate-700 hover:text-[#7C3AED]"
                            >
                              Transparent Pricing
                            </Link>
                          </div>
                        </div>
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                  {marketingLinks.map((link) => {
                    const isActive = pathname === link.href
                    return (
                      <NavigationMenuItem key={link.href}>
                        <NavigationMenuLink asChild>
                          <Link
                            href={link.href}
                            className={cn(
                              "text-sm font-semibold transition-colors px-3 py-2 rounded-lg hover:bg-purple-50/50",
                              isActive
                                ? "text-[#7C3AED] bg-purple-50/70 shadow-inner"
                                : "text-slate-700 hover:text-[#7C3AED]"
                            )}
                          >
                            {link.label}
                          </Link>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    )
                  })}
                </NavigationMenuList>
              </NavigationMenu>
            ) : (
              <ul className="flex flex-1 list-none items-center justify-center gap-2">
                <li>
                  <Link
                    href="/features"
                    className="text-sm font-semibold text-slate-700 hover:text-[#7C3AED] transition-colors px-3 py-2 rounded-lg hover:bg-purple-50/50 inline-flex items-center gap-1"
                  >
                    Platform
                    <ChevronDown className="h-3 w-3 ml-0.5" aria-hidden />
                  </Link>
                </li>
                {marketingLinks.map((link) => {
                  const isActive = pathname === link.href
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn(
                          "text-sm font-semibold transition-colors px-3 py-2 rounded-lg hover:bg-purple-50/50",
                          isActive
                            ? "text-[#7C3AED] bg-purple-50/70 shadow-inner"
                            : "text-slate-700 hover:text-[#7C3AED]"
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <Button 
              variant="ghost" 
              asChild 
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-semibold"
            >
              <Link href="/login">Login</Link>
            </Button>
            <Button 
              asChild 
              className="bg-gradient-to-r from-[#7C3AED] to-[#A855F7] hover:from-[#6D28D9] hover:to-[#8B5CF6] text-white shadow-lg shadow-purple-200/50 px-4 py-2.5 h-auto font-semibold text-sm transform hover:scale-105 hover:shadow-xl hover:shadow-purple-300/50 transition-all"
            >
              <Link href="/contact#get-in-touch">
                Book Demo
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden p-2.5 rounded-xl border-2 border-slate-200 hover:border-[#7C3AED] hover:bg-purple-50/50 transition-all" 
            onClick={() => setOpen((v) => !v)} 
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5 text-slate-700" /> : <Menu className="h-5 w-5 text-slate-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="lg:hidden border-t-2 border-slate-100 bg-white shadow-xl">
          <div className="px-4 py-6 space-y-1">
            {marketingLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-700 hover:bg-purple-50 hover:text-[#7C3AED] transition-all"
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
              <Button 
                variant="outline" 
                asChild 
                onClick={closeMenu}
                className="w-full font-semibold border-2"
              >
                <Link href="/login">Login</Link>
              </Button>
              <Button 
                asChild 
                className="w-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] hover:from-[#6D28D9] hover:to-[#8B5CF6] text-white font-bold shadow-lg" 
                onClick={closeMenu}
              >
                <Link href="/contact#get-in-touch">
                  Book Demo
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

