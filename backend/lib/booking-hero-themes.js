'use strict';

const BOOKING_HERO_THEME_IDS = [
  'light-lavender',
  'light-rose',
  'light-mint',
  'light-cream',
  'light-sky',
  'light-pearl',
];

const DEFAULT_BOOKING_HERO_THEME = 'light-lavender';

function sanitizeBookingHeroTheme(raw) {
  const theme = String(raw || '').trim().toLowerCase();
  return BOOKING_HERO_THEME_IDS.includes(theme) ? theme : DEFAULT_BOOKING_HERO_THEME;
}

module.exports = {
  BOOKING_HERO_THEME_IDS,
  DEFAULT_BOOKING_HERO_THEME,
  sanitizeBookingHeroTheme,
};
