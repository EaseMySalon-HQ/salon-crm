'use strict';

const NAV_BANNER_THEME_REGISTRY = [
  {
    value: 'fathers_day',
    defaults: {
      enabled: false,
      expiresAt: '',
      headline: "Happy Father's Day",
      tagline: 'Treat Dad to a grooming session',
    },
  },
];

function buildDefaultNavBannersSettings() {
  const out = {};
  for (const theme of NAV_BANNER_THEME_REGISTRY) {
    out[theme.value] = { ...theme.defaults };
  }
  return out;
}

function normalizeThemeConfig(themeValue, raw, definition) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: src.enabled === true,
    expiresAt: typeof src.expiresAt === 'string' ? src.expiresAt.trim() : '',
    headline:
      typeof src.headline === 'string' && src.headline.trim()
        ? src.headline.trim()
        : definition.defaults.headline,
    tagline:
      typeof src.tagline === 'string' && src.tagline.trim()
        ? src.tagline.trim()
        : definition.defaults.tagline,
  };
}

function normalizeNavBannersSettings(rawNavBanners, legacyNavBanner) {
  const defaults = buildDefaultNavBannersSettings();
  const src =
    rawNavBanners && typeof rawNavBanners === 'object' ? rawNavBanners : {};
  const legacy =
    legacyNavBanner && typeof legacyNavBanner === 'object' ? legacyNavBanner : null;

  const out = { ...defaults };
  for (const theme of NAV_BANNER_THEME_REGISTRY) {
    const themeRaw = src[theme.value] ?? (legacy?.theme === theme.value ? legacy : undefined);
    out[theme.value] = normalizeThemeConfig(theme.value, themeRaw, theme);
  }
  return out;
}

function isNavBannerThemeActive(config, now = new Date()) {
  if (!config?.enabled) return false;
  const expires = String(config.expiresAt || '').trim();
  if (!expires) return true;
  const end = new Date(`${expires}T23:59:59`);
  if (Number.isNaN(end.getTime())) return true;
  return now <= end;
}

function resolveActiveNavBanner(banners, now = new Date()) {
  if (!banners) return null;
  for (const theme of NAV_BANNER_THEME_REGISTRY) {
    const config = banners[theme.value];
    if (!isNavBannerThemeActive(config, now)) continue;
    return { theme: theme.value, ...config };
  }
  return null;
}

function migrateLegacyNavBanner(notifications) {
  if (!notifications) return notifications;
  const hasBanners =
    notifications.navBanners &&
    typeof notifications.navBanners === 'object' &&
    Object.keys(notifications.navBanners).length > 0;
  if (hasBanners) return notifications;
  if (notifications.navBanner) {
    notifications.navBanners = normalizeNavBannersSettings(null, notifications.navBanner);
  } else {
    notifications.navBanners = buildDefaultNavBannersSettings();
  }
  return notifications;
}

function formatNavBannerForClient(notifications) {
  const migrated = migrateLegacyNavBanner(
    notifications ? { ...notifications } : {}
  );
  const banners = normalizeNavBannersSettings(
    migrated.navBanners,
    migrated.navBanner
  );
  return {
    active: resolveActiveNavBanner(banners),
    banners,
  };
}

module.exports = {
  NAV_BANNER_THEME_REGISTRY,
  buildDefaultNavBannersSettings,
  normalizeNavBannersSettings,
  isNavBannerThemeActive,
  resolveActiveNavBanner,
  migrateLegacyNavBanner,
  formatNavBannerForClient,
};
