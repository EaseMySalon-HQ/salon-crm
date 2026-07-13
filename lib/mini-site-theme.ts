import {
  resolveBookingHeroTheme,
  resolveBookingHeroThemeIdFromAccent,
} from '@/lib/booking-hero-themes'

export function resolveMiniSitePageTheme(themeColor?: string | null) {
  const hero = resolveBookingHeroTheme(resolveBookingHeroThemeIdFromAccent(themeColor))
  const isLight = hero.mode === "light"

  return {
    hero,
    vars: {
      '--site-accent': hero.accent,
      '--site-surface': isLight ? '#ffffff' : '#18181b',
      '--site-surface-muted': hero.baseBg,
      '--site-border': isLight ? '#e7e5e4' : 'rgba(255,255,255,0.12)',
      '--site-text-primary': isLight ? '#1c1917' : '#f5f5f4',
      '--site-text-muted': isLight ? '#57534e' : '#a8a29e',
    } as Record<`--${string}`, string>,
  }
}

/** Tailwind classes wired to mini-site theme CSS variables (set on MiniSiteShell). */
export const ST = {
  textPrimary: 'text-[color:var(--site-text-primary)]',
  textMuted: 'text-[color:var(--site-text-muted)]',
  textAccent: 'text-[color:var(--site-accent)]',
  link: 'text-[color:var(--site-accent)] hover:underline',
  linkNav: 'text-sm font-medium text-[color:var(--site-accent)] hover:underline',
  hoverLinkTitle: 'hover:text-[color:var(--site-accent)] hover:underline',
  btnPrimary:
    'rounded-full bg-[var(--site-accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50',
  btnPrimarySm:
    'rounded-full bg-[var(--site-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90',
  btnPrimaryMd:
    'rounded-full bg-[var(--site-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90',
  btnSecondary:
    'rounded-full border border-[color-mix(in_srgb,var(--site-accent)_30%,#d6d3d1)] px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,white)]',
  btnSecondaryMd:
    'rounded-full border border-[color-mix(in_srgb,var(--site-accent)_30%,#d6d3d1)] px-5 py-3 text-sm font-medium hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,white)]',
  hoverAccentSoft: 'hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,white)]',
  hoverAccentText: 'hover:text-[color:var(--site-accent)]',
  iconSoft: 'bg-[color-mix(in_srgb,var(--site-accent)_12%,white)] text-[color:var(--site-accent)]',
  cardExplore:
    'border border-[color:var(--site-border)] bg-gradient-to-br from-[color-mix(in_srgb,var(--site-accent)_7%,var(--site-surface))] to-[color:var(--site-surface)] hover:border-[color-mix(in_srgb,var(--site-accent)_32%,var(--site-border))]',
  categoryHeading:
    'border-b border-[color-mix(in_srgb,var(--site-accent)_25%,#d6d3d1)] pb-2 text-lg font-semibold uppercase tracking-wide text-stone-900',
  input:
    'w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-[var(--site-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--site-accent)_22%,transparent)]',
  successBox:
    'rounded-2xl border border-[color-mix(in_srgb,var(--site-accent)_25%,#86efac)] bg-[color-mix(in_srgb,var(--site-accent)_8%,#ecfdf5)] p-6 text-[color-mix(in_srgb,var(--site-accent)_65%,#14532d)]',
  logoFallback: 'bg-[var(--site-accent)]',
} as const
