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
    'rounded-full border border-[color-mix(in_srgb,var(--site-accent)_30%,var(--site-border))] px-3 py-1.5 text-xs font-medium text-[color:var(--site-text-primary)] hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,var(--site-surface))]',
  btnSecondaryMd:
    'rounded-full border border-[color-mix(in_srgb,var(--site-accent)_30%,var(--site-border))] px-5 py-3 text-sm font-medium text-[color:var(--site-text-primary)] hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,var(--site-surface))]',
  hoverAccentSoft: 'hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,var(--site-surface))]',
  hoverAccentText: 'hover:text-[color:var(--site-accent)]',
  iconSoft:
    'bg-[color-mix(in_srgb,var(--site-accent)_12%,var(--site-surface))] text-[color:var(--site-accent)]',
  card:
    'rounded-2xl border border-[color:var(--site-border)] bg-[color:var(--site-surface)] shadow-sm',
  cardExplore:
    'border border-[color:var(--site-border)] bg-gradient-to-br from-[color-mix(in_srgb,var(--site-accent)_7%,var(--site-surface))] to-[color:var(--site-surface)] hover:border-[color-mix(in_srgb,var(--site-accent)_32%,var(--site-border))]',
  categoryHeading:
    'border-b border-[color-mix(in_srgb,var(--site-accent)_25%,var(--site-border))] pb-2 text-lg font-semibold uppercase tracking-wide text-[color:var(--site-text-primary)]',
  input:
    'w-full rounded-lg border border-[color:var(--site-border)] bg-[color:var(--site-surface)] px-3 py-2 text-[color:var(--site-text-primary)] placeholder:text-[color:var(--site-text-muted)] focus:border-[var(--site-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--site-accent)_22%,transparent)]',
  selectTrigger:
    'border-[color:var(--site-border)] bg-[color:var(--site-surface)] text-[color:var(--site-text-primary)] focus:ring-[color-mix(in_srgb,var(--site-accent)_22%,transparent)]',
  selectContent:
    'border-[color:var(--site-border)] bg-[color:var(--site-surface)] text-[color:var(--site-text-primary)]',
  selectItem:
    'focus:bg-[color-mix(in_srgb,var(--site-accent)_10%,var(--site-surface))] focus:text-[color:var(--site-text-primary)]',
  listPanel:
    'overflow-hidden rounded-xl border border-[color:var(--site-border)] bg-[color:var(--site-surface)]',
  listHeader:
    'border-b border-[color:var(--site-border)] bg-[color-mix(in_srgb,var(--site-text-muted)_8%,var(--site-surface))]',
  listDivider: 'divide-[color:var(--site-border)]',
  imagePlaceholder:
    'bg-[color-mix(in_srgb,var(--site-text-muted)_12%,var(--site-surface))] text-[color:var(--site-text-muted)]',
  successBox:
    'rounded-2xl border border-[color-mix(in_srgb,var(--site-accent)_35%,var(--site-border))] bg-[color-mix(in_srgb,var(--site-accent)_10%,var(--site-surface))] p-6 text-[color:var(--site-text-primary)]',
  logoFallback: 'bg-[var(--site-accent)]',
} as const
