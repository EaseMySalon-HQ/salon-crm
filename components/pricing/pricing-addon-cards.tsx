"use client"

import { cn } from "@/lib/utils"

type BillingType = "monthly" | "one-time"

interface AddOn {
  id: string
  name: string
  description: string
  priceInr: number
  billing: BillingType
  accentBg: string
  accentRing: string
  icon: React.ReactNode
}

function GoogleBusinessIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-7" aria-hidden>
      <path
        fill="#4285F4"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
      <path
        fill="#34A853"
        d="M6.306 14.691 12.879 19.5C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691Z"
      />
      <path
        fill="#FBBC05"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.193l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44Z"
      />
      <path
        fill="#EA4335"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
        opacity={0}
      />
    </svg>
  )
}

function RazorpayIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <path
        fill="#0C2451"
        d="M22.436 4 18.2 19.83l-1.747 5.69L13.61 32h-5.39l3.66-13.59-2.55 9.46h-5.4L8.21 11.93l1.07-4 1.07-4Z"
      />
      <path
        fill="#3395FF"
        d="M28 0 18.43 28h-5.39l1.97-7.31-.04.15L19.21 0Z"
      />
    </svg>
  )
}

function PosIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="14" rx="2.5" stroke="#0F766E" strokeWidth="1.7" />
      <path d="M3 11h18" stroke="#0F766E" strokeWidth="1.7" />
      <path d="M8 4h8l-1 2H9L8 4Z" fill="#0F766E" />
      <rect x="6.5" y="13.5" width="3" height="2" rx="0.5" fill="#0F766E" />
      <rect x="10.5" y="13.5" width="3" height="2" rx="0.5" fill="#14B8A6" />
      <rect x="14.5" y="13.5" width="3" height="2" rx="0.5" fill="#14B8A6" />
      <rect x="6.5" y="16.5" width="3" height="2" rx="0.5" fill="#14B8A6" />
      <rect x="10.5" y="16.5" width="3" height="2" rx="0.5" fill="#14B8A6" />
      <rect x="14.5" y="16.5" width="3" height="2" rx="0.5" fill="#0F766E" />
    </svg>
  )
}

function MetaPixelIcon() {
  return (
    <svg viewBox="0 0 36 36" className="h-7 w-7" aria-hidden>
      <defs>
        <linearGradient id="meta-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0064E1" />
          <stop offset="0.5" stopColor="#0082FB" />
          <stop offset="1" stopColor="#00C6FF" />
        </linearGradient>
      </defs>
      <path
        fill="url(#meta-grad)"
        d="M6 18c0-5.523 2.984-9.5 7.5-9.5 2.74 0 4.65 1.42 7.5 5.36 2.85 3.94 4.76 5.36 7.5 5.36 2.376 0 3.95-1.99 3.95-5.22 0-2.49-1.027-4.21-2.65-4.21-1.305 0-2.32.92-3.93 3.4l-1.71-2.41C26.16 7.93 27.81 6.5 30 6.5c3.85 0 6 3.31 6 8.5 0 5.34-2.74 8.5-6.45 8.5-2.97 0-5-1.34-8.05-5.55-3.05 4.21-5.08 5.55-8.05 5.55C9.74 23.5 7 20.34 7 15c0-5.19 2.15-8.5 6-8.5 1.96 0 3.55 1.13 5.5 3.78"
      />
    </svg>
  )
}

function CreativeStudioIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden>
      <defs>
        <linearGradient id="creative-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F472B6" />
          <stop offset="0.5" stopColor="#A855F7" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <path
        fill="url(#creative-grad)"
        d="M16 4c-6.6 0-12 4.7-12 10.5 0 3.4 1.9 6.4 4.9 8.3.7.4 1.1 1.2.9 2L9 27.4c-.2 1 .8 1.8 1.7 1.4l3.2-1.4c.5-.2 1-.3 1.5-.2.6.1 1.2.1 1.6.1 6.6 0 12-4.7 12-10.5S22.6 4 16 4Z"
      />
      <circle cx="11" cy="14" r="1.6" fill="#fff" />
      <circle cx="16" cy="11.5" r="1.6" fill="#fff" />
      <circle cx="21" cy="14" r="1.6" fill="#fff" />
      <circle cx="19" cy="19" r="1.6" fill="#fff" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <path
        fill="#25D366"
        d="M16 3C8.82 3 3 8.82 3 16c0 2.29.6 4.43 1.65 6.3L3 29l6.93-1.6A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3Z"
      />
      <path
        fill="#fff"
        d="M12.04 9.6c-.27-.6-.55-.61-.81-.62l-.69-.01a1.32 1.32 0 0 0-.96.45c-.33.36-1.27 1.24-1.27 3.02s1.3 3.51 1.48 3.75c.18.24 2.51 4.02 6.2 5.48 3.07 1.22 3.69.98 4.36.92.66-.06 2.13-.87 2.43-1.71.3-.84.3-1.56.21-1.71-.09-.15-.33-.24-.69-.42-.36-.18-2.13-1.05-2.46-1.17-.33-.12-.57-.18-.81.18-.24.36-.93 1.17-1.14 1.41-.21.24-.42.27-.78.09-.36-.18-1.51-.56-2.88-1.78-1.06-.95-1.78-2.12-1.99-2.48-.21-.36-.02-.55.16-.73.16-.16.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.96-1.11-2.65Z"
      />
    </svg>
  )
}

const ADDONS: AddOn[] = [
  {
    id: "google-business",
    name: "Google Business Profile",
    description: "Profile setup, review automation, and monthly optimization to win local search.",
    priceInr: 499,
    billing: "monthly",
    accentBg: "bg-blue-50",
    accentRing: "ring-blue-100",
    icon: <GoogleBusinessIcon />,
  },
  {
    id: "razorpay",
    name: "Razorpay Integration",
    description: "Accept UPI, cards, and EMI at checkout with payouts and reconciliation built in.",
    priceInr: 1999,
    billing: "one-time",
    accentBg: "bg-indigo-50",
    accentRing: "ring-indigo-100",
    icon: <RazorpayIcon />,
  },
  {
    id: "pos-integration",
    name: "POS Integration",
    description: "Connect your existing POS terminal so bills, refunds, and sync run end-to-end.",
    priceInr: 1999,
    billing: "one-time",
    accentBg: "bg-teal-50",
    accentRing: "ring-teal-100",
    icon: <PosIcon />,
  },
  {
    id: "meta-pixel-ads",
    name: "Meta Pixel & Ads",
    description: "Pixel install, conversion events, and ad-spend tracking for Facebook & Instagram.",
    priceInr: 999,
    billing: "monthly",
    accentBg: "bg-sky-50",
    accentRing: "ring-sky-100",
    icon: <MetaPixelIcon />,
  },
  {
    id: "whatsapp-integration",
    name: "WhatsApp Integration",
    description: "Gupshup WABA onboarding, number verification, templates, and end-to-end setup.",
    priceInr: 4999,
    billing: "one-time",
    accentBg: "bg-emerald-50",
    accentRing: "ring-emerald-100",
    icon: <WhatsAppIcon />,
  },
  {
    id: "creative-studio",
    name: "Creative Studio",
    description: "Monthly social posts, reels, and ad creatives designed by our in-house studio.",
    priceInr: 499,
    billing: "monthly",
    accentBg: "bg-fuchsia-50",
    accentRing: "ring-fuchsia-100",
    icon: <CreativeStudioIcon />,
  },
]

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n)
}

function AddOnCard({ addon }: { addon: AddOn }) {
  const isMonthly = addon.billing === "monthly"
  return (
    <article className="relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1",
            addon.accentBg,
            addon.accentRing
          )}
        >
          {addon.icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{addon.name}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            {isMonthly ? "Recurring" : "One-time setup"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">{addon.description}</p>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
          {formatInr(addon.priceInr)}
        </span>
        <span className="text-sm font-medium text-slate-500">
          {isMonthly ? "/ month + GST" : "+ GST"}
        </span>
      </div>
      {!isMonthly ? (
        <p className="mt-0.5 text-xs text-slate-500">One-time setup cost</p>
      ) : null}
    </article>
  )
}

export function PricingAddOnCards() {
  return (
    <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {ADDONS.map((addon) => (
        <AddOnCard key={addon.id} addon={addon} />
      ))}
    </div>
  )
}
