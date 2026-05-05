"use client"

/**
 * Re-export shared toast module so `<Toaster />` sees the same in-memory queue.
 * Duplicate implementations used to live here and in `@/components/ui/use-toast` — calls from
 * `hooks` never reached the toaster UI (no visible toasts).
 */
export { useToast, toast } from "@/components/ui/use-toast"
