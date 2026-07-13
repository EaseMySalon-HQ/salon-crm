'use strict';

const { slugify } = require('./slug-helper');
const { normalizeCustomFieldList, publicCustomFields } = require('./website-enquiry-fields');

function ensureSlug(doc, nameField = 'name') {
  if (doc.slug && String(doc.slug).trim()) return String(doc.slug).trim().toLowerCase();
  return slugify(doc[nameField] || doc.planName || 'item');
}

function formatMoney(n, showPrices) {
  if (!showPrices) return null;
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n);
}

function resolveCoverImages(website = {}) {
  const fromArray = Array.isArray(website.coverImages)
    ? website.coverImages.map((img) => String(img || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  if (fromArray.length) return fromArray;
  const legacy = String(website.coverImage || '').trim();
  return legacy ? [legacy] : [];
}

function serializeService(s, { showPrices = true } = {}) {
  if (!s) return null;
  return {
    id: String(s._id),
    slug: ensureSlug(s),
    name: s.name || '',
    category: s.category || '',
    duration: s.duration || 0,
    price: formatMoney(s.offerPrice != null ? s.offerPrice : s.price, showPrices),
    fullPrice: formatMoney(s.fullPrice, showPrices),
    description: s.description || '',
    shortDescription: s.shortDescription || '',
    imageUrl: s.imageUrl || '',
    imageAlt: s.imageAlt || s.name || '',
    isFeatured: Boolean(s.isFeatured),
    displayOrder: s.displayOrder || 0,
    bookableOnline: s.showInOnlineBooking !== false && (s.serviceKind == null || s.serviceKind === 'simple'),
    seoTitle: s.seoTitle || '',
    seoDescription: s.seoDescription || '',
  };
}

function serializeProduct(p, { showPrices = true } = {}) {
  if (!p) return null;
  return {
    id: String(p._id),
    slug: ensureSlug(p),
    name: p.name || '',
    category: p.category || '',
    price: formatMoney(p.offerPrice != null ? p.offerPrice : p.price, showPrices),
    description: p.description || '',
    shortDescription: p.shortDescription || '',
    imageUrl: p.imageUrl || '',
    imageAlt: p.imageAlt || p.name || '',
    isFeatured: Boolean(p.isFeatured),
    displayOrder: p.displayOrder || 0,
    seoTitle: p.seoTitle || '',
    seoDescription: p.seoDescription || '',
  };
}

function serializePackage(pkg, { showPrices = true, bookableServiceIds = [] } = {}) {
  if (!pkg) return null;
  return {
    id: String(pkg._id),
    slug: ensureSlug(pkg),
    name: pkg.name || '',
    type: pkg.type || 'FIXED',
    description: pkg.description || '',
    shortDescription: pkg.shortDescription || '',
    price: formatMoney(pkg.total_price, showPrices),
    imageUrl: pkg.image_url || '',
    imageAlt: pkg.imageAlt || pkg.name || '',
    totalSittings: pkg.total_sittings || null,
    validityDays: pkg.validity_days ?? null,
    isFeatured: Boolean(pkg.isFeatured),
    displayOrder: pkg.displayOrder || 0,
    bookableServiceIds: (bookableServiceIds || []).map(String),
    bookableOnline: (bookableServiceIds || []).length > 0,
    seoTitle: pkg.seoTitle || '',
    seoDescription: pkg.seoDescription || '',
  };
}

function serializeMembership(m, { showPrices = true } = {}) {
  if (!m) return null;
  return {
    id: String(m._id),
    slug: ensureSlug(m, 'planName'),
    name: m.planName || '',
    price: formatMoney(m.price, showPrices),
    durationInDays: m.unlimitedDuration ? null : m.durationInDays,
    unlimitedDuration: Boolean(m.unlimitedDuration),
    discountPercentage: m.discountPercentage || 0,
    description: m.description || '',
    shortDescription: m.shortDescription || '',
    imageUrl: m.imageUrl || '',
    imageAlt: m.imageAlt || m.planName || '',
    isFeatured: Boolean(m.isFeatured),
    displayOrder: m.displayOrder || 0,
    seoTitle: m.seoTitle || '',
    seoDescription: m.seoDescription || '',
  };
}

function serializePrepaidPlan(p, { showPrices = true } = {}) {
  if (!p) return null;
  return {
    id: String(p._id),
    slug: ensureSlug(p),
    name: p.name || '',
    payAmount: formatMoney(p.payAmount, showPrices),
    creditAmount: formatMoney(p.creditAmount, showPrices),
    validityDays: p.validityDays || 0,
    shortDescription: p.shortDescription || '',
    isFeatured: Boolean(p.isFeatured),
    displayOrder: p.displayOrder || 0,
  };
}

function serializeStaff(s) {
  if (!s) return null;
  return {
    id: String(s._id),
    slug: ensureSlug(s),
    name: s.name || '',
    title: s.title || (s.role === 'admin' ? 'Owner' : s.role === 'manager' ? 'Manager' : 'Stylist'),
    avatar: s.avatar || '',
    specialties: Array.isArray(s.specialties) ? s.specialties : [],
    shortDescription: s.shortDescription || '',
    isFeatured: Boolean(s.isFeatured),
    displayOrder: s.displayOrder || 0,
  };
}

function serializeGalleryItem(g) {
  if (!g) return null;
  return {
    id: String(g._id),
    title: g.title || '',
    imageUrl: g.imageUrl || '',
    alt: g.alt || g.title || '',
    isFeatured: Boolean(g.isFeatured),
    displayOrder: g.displayOrder || 0,
  };
}

function serializeOffer(o) {
  if (!o) return null;
  return {
    id: String(o._id),
    title: o.title || '',
    shortDescription: o.shortDescription || '',
    imageUrl: o.imageUrl || '',
    ctaLabel: o.ctaLabel || 'Learn more',
    ctaHref: o.ctaHref || '',
    startDate: o.startDate || null,
    endDate: o.endDate || null,
    isFeatured: Boolean(o.isFeatured),
    displayOrder: o.displayOrder || 0,
  };
}

function serializeReview(r) {
  if (!r) return null;
  return {
    id: String(r._id || r.reviewId || ''),
    authorName: r.customerName || r.reviewerName || 'Guest',
    rating: Number(r.rating || r.starRating || 0),
    text: r.reviewText || r.comment || '',
    source: r.source || (r.reviewId ? 'gmb' : 'feedback'),
    createdAt: r.submittedAt || r.createTime || r.createdAt || null,
  };
}

function defaultWebsiteSettings(website = {}) {
  const v = website.visibility || {};
  return {
    enabled: Boolean(website.enabled),
    coverImage: resolveCoverImages(website)[0] || '',
    coverImages: resolveCoverImages(website),
    tagline: website.tagline || '',
    description: website.description || '',
    themeColor: website.themeColor || '#111827',
    businessCategory: website.businessCategory || '',
    seo: {
      title: website.seo?.title || '',
      metaDescription: website.seo?.metaDescription || '',
      ogImage: website.seo?.ogImage || '',
    },
    social: {
      instagram: website.social?.instagram || '',
      facebook: website.social?.facebook || '',
      googleMapsUrl: website.social?.googleMapsUrl || '',
      googleProfileUrl: website.social?.googleProfileUrl || '',
    },
    contact: {
      whatsappNumber: website.contact?.whatsappNumber || '',
      callNumber: website.contact?.callNumber || '',
    },
    visibility: {
      showPrices: v.showPrices !== false,
      showServices: v.showServices !== false,
      showStaff: v.showStaff !== false,
      showProducts: v.showProducts !== false,
      retailProductsOnly: v.retailProductsOnly === true,
      showProductPrices:
        typeof v.showProductPrices === 'boolean' ? v.showProductPrices : v.showPrices !== false,
      showProductImages: v.showProductImages !== false,
      showPackages: v.showPackages !== false,
      showMemberships: v.showMemberships === true,
      showPrepaidWallets: v.showPrepaidWallets === true,
      showOffers: v.showOffers !== false,
      showGallery: v.showGallery !== false,
      showReviews: v.showReviews !== false,
    },
    featured: {
      serviceIds: (website.featured?.serviceIds || []).map(String),
      packageIds: (website.featured?.packageIds || []).map(String),
      productIds: (website.featured?.productIds || []).map(String),
      membershipIds: (website.featured?.membershipIds || []).map(String),
    },
    externalAnalytics: {
      gaMeasurementId: website.externalAnalytics?.gaMeasurementId || '',
      metaPixelId: website.externalAnalytics?.metaPixelId || '',
      plausibleDomain: website.externalAnalytics?.plausibleDomain || '',
    },
    enquiryForm: {
      customFields: normalizeCustomFieldList(website.enquiryForm?.customFields),
    },
  };
}

function serializeSiteProfile(business, extras = {}) {
  const website = defaultWebsiteSettings(business.settings?.website || {});
  const hours = business.settings?.operatingHours || {};
  const phone =
    (extras.phone != null ? String(extras.phone).trim() : '') ||
    website.contact.callNumber ||
    business.contact?.phone ||
    '';
  const whatsapp = website.contact.whatsappNumber || phone;
  const mapsUrl =
    (extras.googleMapsUrl != null ? String(extras.googleMapsUrl).trim() : '') ||
    website.social.googleMapsUrl ||
    extras.googleMapsUrl ||
    '';
  const googleProfileUrl =
    (extras.googleProfileUrl != null ? String(extras.googleProfileUrl).trim() : '') ||
    website.social?.googleProfileUrl ||
    '';
  const logoUrl =
    (extras.logoUrl != null ? String(extras.logoUrl).trim() : '') ||
    business.settings?.branding?.logo ||
    '';
  const address = extras.address || {
    street: business.address?.street || '',
    city: business.address?.city || '',
    state: business.address?.state || '',
    zipCode: business.address?.zipCode || '',
    country: business.address?.country || 'India',
  };
  const showcase = Array.isArray(business.settings?.appointmentSettings?.showcaseImages)
    ? business.settings.appointmentSettings.showcaseImages.filter(Boolean).slice(0, 12)
    : [];
  const publicSlug = (business.slug || String(business.code || '').toLowerCase()).toLowerCase();
  const websiteCovers = resolveCoverImages(website);
  const coverImages = websiteCovers.length ? websiteCovers : showcase.slice(0, 8);

  return {
    slug: publicSlug,
    bookingCode: String(business.code || '').toUpperCase(),
    name: business.name || '',
    businessType: business.businessType || 'salon',
    businessCategory: website.businessCategory || business.businessType || 'salon',
    tagline: website.tagline || business.settings?.appointmentSettings?.bookingTagline || '',
    description: website.description || extras.description || '',
    coverImage: coverImages[0] || '',
    coverImages,
    showcaseImages: showcase,
    logoUrl,
    themeColor: website.themeColor,
    address,
    contact: {
      phone,
      whatsappNumber: whatsapp,
      email: business.contact?.email || '',
      website: business.contact?.website || '',
    },
    social: {
      instagram: website.social.instagram,
      facebook: website.social.facebook,
      googleMapsUrl: mapsUrl,
      googleProfileUrl: googleProfileUrl || website.social?.googleProfileUrl || '',
    },
    operatingHours: hours,
    visibility: website.visibility,
    featured: website.featured,
    seo: {
      title: website.seo.title || business.name || '',
      metaDescription:
        website.seo.metaDescription ||
        website.description ||
        `Visit ${business.name || 'our salon'} — book appointments online.`,
      ogImage: website.seo.ogImage || website.coverImage || logoUrl || '',
    },
    onlineBookingEnabled: Boolean(
      business.settings?.appointmentSettings?.allowOnlineBooking && extras.onlineBookingFeature
    ),
    externalAnalytics: website.externalAnalytics,
    enquiryForm: {
      customFields: publicCustomFields(website.enquiryForm?.customFields),
    },
    counts: extras.counts || {},
    rating: extras.rating || null,
  };
}

module.exports = {
  ensureSlug,
  serializeService,
  serializeProduct,
  serializePackage,
  serializeMembership,
  serializePrepaidPlan,
  serializeStaff,
  serializeGalleryItem,
  serializeOffer,
  serializeReview,
  defaultWebsiteSettings,
  serializeSiteProfile,
};
