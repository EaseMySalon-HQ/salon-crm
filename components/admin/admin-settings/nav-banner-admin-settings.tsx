"use client"

import { Sparkles, Shirt, Palette } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  NAV_BANNER_THEME_REGISTRY,
  isNavBannerThemeActive,
  normalizeNavBannersSettings,
  type NavBannerTheme,
  type NavBannersSettings,
} from "@/lib/nav-banner"

type NavBannerAdminSettingsProps = {
  settings?: { navBanners?: Partial<NavBannersSettings>; navBanner?: unknown }
  onSettingChange: (path: string, value: unknown) => void
}

function ThemePreview({
  headline,
  tagline,
  active,
}: {
  headline: string
  tagline: string
  active: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium">Preview</Label>
        <Badge variant={active ? "default" : "secondary"}>
          {active ? "Would show now" : "Hidden"}
        </Badge>
      </div>
      <div className="fathers-day-nav relative overflow-hidden rounded-xl border border-amber-400/25 shadow-sm">
        <div className="fathers-day-banner-gradient pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/2 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent animate-gold-sheen"
          aria-hidden
        />
        <div className="relative flex items-center justify-center gap-2 px-4 py-3">
          <Shirt className="h-3.5 w-3.5 text-amber-300/90" aria-hidden />
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-xs font-semibold">
            <Sparkles className="h-3 w-3 text-amber-300" aria-hidden />
            <span className="fathers-day-text-shimmer">{headline}</span>
            <span className="text-slate-300/80">·</span>
            <span className="text-slate-200/90">{tagline}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function ThemeBannerCard({
  theme,
  config,
  onSettingChange,
}: {
  theme: (typeof NAV_BANNER_THEME_REGISTRY)[number]
  config: NavBannersSettings[NavBannerTheme]
  onSettingChange: (path: string, value: unknown) => void
}) {
  const basePath = `navBanners.${theme.value}`
  const previewActive = isNavBannerThemeActive(config)

  return (
    <Card key={theme.value} className="border-slate-200/80">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{theme.label}</CardTitle>
            <CardDescription className="mt-1">{theme.description}</CardDescription>
          </div>
          <Switch
            id={`${theme.value}-enabled`}
            checked={config.enabled}
            aria-label={`Enable ${theme.label} banner`}
            onCheckedChange={(checked) => {
              onSettingChange(`${basePath}.enabled`, checked)
              if (checked && !config.expiresAt && theme.suggestExpiry) {
                onSettingChange(`${basePath}.expiresAt`, theme.suggestExpiry())
              }
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${theme.value}-expires`}>Expiry date</Label>
            <Input
              id={`${theme.value}-expires`}
              type="date"
              value={config.expiresAt}
              onChange={(e) => onSettingChange(`${basePath}.expiresAt`, e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Hides after this date (end of day). Leave empty for no automatic expiry.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${theme.value}-headline`}>Headline</Label>
            <Input
              id={`${theme.value}-headline`}
              value={config.headline}
              onChange={(e) => onSettingChange(`${basePath}.headline`, e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${theme.value}-tagline`}>Tagline</Label>
          <Input
            id={`${theme.value}-tagline`}
            value={config.tagline}
            onChange={(e) => onSettingChange(`${basePath}.tagline`, e.target.value)}
          />
        </div>
        <ThemePreview headline={config.headline} tagline={config.tagline} active={previewActive} />
      </CardContent>
    </Card>
  )
}

export function NavBannerAdminSettings({ settings, onSettingChange }: NavBannerAdminSettingsProps) {
  const navBanners = normalizeNavBannersSettings(settings?.navBanners, settings?.navBanner)

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/80 bg-slate-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-indigo-600" />
            Top navigation banners
          </CardTitle>
          <CardDescription>
            Each theme has its own toggle and expiry. When multiple themes are enabled, the first active
            theme in the list below is shown in the salon top nav.
          </CardDescription>
        </CardHeader>
      </Card>

      {NAV_BANNER_THEME_REGISTRY.map((theme) => (
        <ThemeBannerCard
          key={theme.value}
          theme={theme}
          config={navBanners[theme.value]}
          onSettingChange={onSettingChange}
        />
      ))}
    </div>
  )
}
