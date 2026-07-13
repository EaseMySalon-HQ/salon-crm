"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Switch } from "@/components/ui/switch"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function useDarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  return {
    isDark,
    mounted,
    setDark: (checked: boolean) => setTheme(checked ? "dark" : "light"),
  }
}

export function ThemeToggleMenuItem() {
  const { isDark, mounted, setDark } = useDarkModeToggle()

  return (
    <DropdownMenuItem
      className="flex items-center gap-3 p-3 hover:bg-accent transition-all duration-200 cursor-pointer rounded-lg m-1 focus:bg-accent"
      onSelect={(event) => event.preventDefault()}
    >
      <div className="p-2 rounded-lg bg-muted">
        {isDark ? (
          <Moon className="h-4 w-4 text-foreground" aria-hidden />
        ) : (
          <Sun className="h-4 w-4 text-foreground" aria-hidden />
        )}
      </div>
      <span className="flex-1 font-medium text-foreground">Dark mode</span>
      <Switch
        checked={isDark}
        disabled={!mounted}
        onCheckedChange={setDark}
        aria-label="Toggle dark mode"
      />
    </DropdownMenuItem>
  )
}

export function ThemeToggleButton({ className }: { className?: string }) {
  const { isDark, mounted, setDark } = useDarkModeToggle()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9", className)}
      disabled={!mounted}
      onClick={() => setDark(!isDark)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
