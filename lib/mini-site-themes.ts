export const MINI_SITE_THEME_IDS = [
  'charcoal',
  'lavender',
  'rose',
  'mint',
  'amber',
  'ocean',
] as const

export type MiniSiteThemeId = (typeof MINI_SITE_THEME_IDS)[number]

export type MiniSiteTheme = {
  id: MiniSiteThemeId
  label: string
  accent: string
}

export const MINI_SITE_THEMES: Record<MiniSiteThemeId, MiniSiteTheme> = {
  charcoal: { id: 'charcoal', label: 'Classic charcoal', accent: '#111827' },
  lavender: { id: 'lavender', label: 'Soft lavender', accent: '#7C3AED' },
  rose: { id: 'rose', label: 'Rose water', accent: '#E11D48' },
  mint: { id: 'mint', label: 'Fresh mint', accent: '#059669' },
  amber: { id: 'amber', label: 'Warm amber', accent: '#D97706' },
  ocean: { id: 'ocean', label: 'Ocean sky', accent: '#0284C7' },
}

export const DEFAULT_MINI_SITE_THEME: MiniSiteThemeId = 'charcoal'

export function isMiniSiteThemeId(value: string): value is MiniSiteThemeId {
  return (MINI_SITE_THEME_IDS as readonly string[]).includes(value)
}

export function resolveMiniSiteThemeFromAccent(accent?: string | null): MiniSiteTheme {
  const normalized = String(accent || '')
    .trim()
    .toLowerCase()
  const match = MINI_SITE_THEME_IDS.map((id) => MINI_SITE_THEMES[id]).find(
    (t) => t.accent.toLowerCase() === normalized
  )
  return match || MINI_SITE_THEMES[DEFAULT_MINI_SITE_THEME]
}
