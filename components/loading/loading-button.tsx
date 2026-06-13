import * as React from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/loading/loading-spinner"
import { cn } from "@/lib/utils"

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
  loadingText?: string
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, loadingText, disabled, children, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        className={cn(className)}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" label={loadingText || "Loading"} />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </Button>
    )
  }
)
LoadingButton.displayName = "LoadingButton"
