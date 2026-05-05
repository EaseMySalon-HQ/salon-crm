"use client"

/**
 * Single source of truth: the layout `<Toaster />` subscribes to
 * `@/components/ui/use-toast`. Re-export so every `toast()` call updates the same store.
 */
export { useToast, toast } from "@/components/ui/use-toast"
