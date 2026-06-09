"use client"

import { BranchPicker } from "@/components/auth/branch-picker"

export default function SelectBranchPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#312E81]">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -top-16 -left-10 h-96 w-96 rounded-full bg-[#7C3AED]/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-[#A855F7]/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full">
          <div className="absolute inset-x-4 top-1/2 -z-10 mx-auto h-64 max-w-2xl -translate-y-1/2 rounded-[32px] bg-gradient-to-br from-[#7C3AED] to-[#A855F7] opacity-30 blur-3xl" />
          <div className="rounded-[32px] border border-white/40 bg-white/95 p-6 shadow-2xl shadow-purple-900/30 backdrop-blur sm:p-8">
            <BranchPicker />
          </div>
        </div>
      </div>
    </div>
  )
}
