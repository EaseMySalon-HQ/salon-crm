'use strict';

const BOOKING_HERO_THEME_IDS = [
  'purple',
  'midnight',
  'rose',
  'emerald',
  'amber',
  'ocean',
  'sunset',
  'slate',
  'light-lavender',
  'light-rose',
  'light-mint',
  'light-cream',
  'light-sky',
  'light-pearl',
];

const DEFAULT_BOOKING_HERO_THEME = 'purple';

function sanitizeBookingHeroTheme(raw) {
  const theme = String(raw || '').trim().toLowerCase();
  return BOOKING_HERO_THEME_IDS.includes(theme) ? theme : DEFAULT_BOOKING_HERO_THEME;
}

module.exports = {
  BOOKING_HERO_THEME_IDS,
  DEFAULT_BOOKING_HERO_THEME,
  sanitizeBookingHeroTheme,
};
