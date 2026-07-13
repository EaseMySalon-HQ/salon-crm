'use strict';

const BOOKING_HERO_THEME_IDS = [
  'light-lavender',
  'light-rose',
  'light-mint',
  'light-cream',
  'light-sky',
  'light-pearl',
  'luxury-ivory-gold',
  'luxury-black-gold',
  'luxury-onyx-champagne',
];

const DEFAULT_BOOKING_HERO_THEME = 'light-lavender';

const BOOKING_HERO_THEME_ACCENTS = {
  'light-lavender': '#7C3AED',
  'light-rose': '#E11D48',
  'light-mint': '#059669',
  'light-cream': '#D97706',
  'light-sky': '#0284C7',
  'light-pearl': '#475569',
  'luxury-ivory-gold': '#9A7B2F',
  'luxury-black-gold': '#C9A227',
  'luxury-onyx-champagne': '#B08D57',
};

function sanitizeBookingHeroTheme(raw) {
  const theme = String(raw || '').trim().toLowerCase();
  return BOOKING_HERO_THEME_IDS.includes(theme) ? theme : DEFAULT_BOOKING_HERO_THEME;
}

function accentForBookingHeroTheme(themeId) {
  return BOOKING_HERO_THEME_ACCENTS[sanitizeBookingHeroTheme(themeId)];
}

function resolveBookingHeroThemeFromAccent(accent) {
  const normalized = String(accent || '').trim().toLowerCase();
  const match = Object.entries(BOOKING_HERO_THEME_ACCENTS).find(
    ([, value]) => value.toLowerCase() === normalized
  );
  return match ? match[0] : DEFAULT_BOOKING_HERO_THEME;
}

function resolveBookingHeroThemeForBusiness(business) {
  const stored = business?.settings?.appointmentSettings?.bookingHeroTheme;
  if (stored && BOOKING_HERO_THEME_IDS.includes(String(stored).trim().toLowerCase())) {
    return sanitizeBookingHeroTheme(stored);
  }
  return resolveBookingHeroThemeFromAccent(business?.settings?.website?.themeColor);
}

module.exports = {
  BOOKING_HERO_THEME_IDS,
  DEFAULT_BOOKING_HERO_THEME,
  BOOKING_HERO_THEME_ACCENTS,
  sanitizeBookingHeroTheme,
  accentForBookingHeroTheme,
  resolveBookingHeroThemeFromAccent,
  resolveBookingHeroThemeForBusiness,
};
