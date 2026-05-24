"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProgress,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"

const DEFAULT_TOAST_DURATION = 3000

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={DEFAULT_TOAST_DURATION}>
      {toasts.map(({ id, title, description, action, duration, variant, ...props }) => {
        const toastDuration =
          typeof duration === "number" && duration > 0
            ? Math.min(duration, DEFAULT_TOAST_DURATION)
            : DEFAULT_TOAST_DURATION
        return (
          <Toast key={id} duration={toastDuration} variant={variant} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
            <ToastProgress duration={toastDuration} variant={variant} />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
