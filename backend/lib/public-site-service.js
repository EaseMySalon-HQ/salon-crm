'use strict';

const {
  serializeService,
  serializeProduct,
  serializePackage,
  serializeMembership,
  serializePrepaidPlan,
  serializeStaff,
  serializeGalleryItem,
  serializeOffer,
  serializeReview,
  serializeSiteProfile,
  ensureSlug,
} = require('./site-serializers');
const { hasFeature } = require('./entitlements');
const { slugify } = require('./slug-helper');

async function loadBusinessSettingsForSite(businessModels, business) {
  const website = business.settings?.website || {};
  const fallback = {
    logoUrl: business.settings?.branding?.logo || '',
    googleMapsUrl: website.social?.googleMapsUrl || '',
    googleProfileUrl: website.social?.googleProfileUrl || '',
    description: website.description || '',
    phone: business.contact?.phone || '',
    address: {
      street: business.address?.street || '',
      city: business.address?.city || '',
      state: business.address?.state || '',
      zipCode: business.address?.zipCode || '',
      country: business.address?.country || 'India',
    },
  };

  try {
    const { BusinessSettings } = businessModels;
    if (!BusinessSettings) return fallback;
    const settings = await BusinessSettings.findOne()
      .select(
        'logo description googleMapsUrl googleReviewUrl phone address city state zipCode'
      )
      .lean();
    if (!settings) return fallback;

    return {
      logoUrl: String(settings.logo || '').trim() || fallback.logoUrl,
      googleMapsUrl: String(settings.googleMapsUrl || '').trim() || fallback.googleMapsUrl,
      googleProfileUrl:
        String(settings.googleReviewUrl || '').trim() || fallback.googleProfileUrl,
      description: settings.description || fallback.description,
      phone: String(settings.phone || '').trim() || fallback.phone,
      address: {
        street: String(settings.address || '').trim() || fallback.address.street,
        city: String(settings.city || '').trim() || fallback.address.city,
        state: String(settings.state || '').trim() || fallback.address.state,
        zipCode: String(settings.zipCode || '').trim() || fallback.address.zipCode,
        country: fallback.address.country,
      },
    };
  } catch {
    return fallback;
  }
}

async function getPublicCounts(businessModels, branchId, visibility) {
  const { Service, Product, Package, MembershipPlan, Staff, WebsiteGallery, WebsiteOffer } =
    businessModels;
  const productQuery = productPublicQuery(branchId, visibility);
  const [
    services,
    products,
    packages,
    memberships,
    staff,
    gallery,
    offers,
  ] = await Promise.all([
    Service.countDocuments({ branchId, isActive: { $ne: false }, isPublic: true }),
    visibility.showProducts
      ? Product.countDocuments(productQuery)
      : 0,
    visibility.showPackages
      ? Package.countDocuments({ branchId, status: 'ACTIVE', isPublic: true })
      : 0,
    visibility.showMemberships
      ? MembershipPlan.countDocuments({ branchId, isActive: true, isPublic: true })
      : 0,
    visibility.showStaff
      ? Staff.countDocuments({ branchId, isActive: { $ne: false }, isPublic: true })
      : 0,
    visibility.showGallery && WebsiteGallery
      ? WebsiteGallery.countDocuments({ branchId, isPublic: true })
      : 0,
    visibility.showOffers && WebsiteOffer
      ? WebsiteOffer.countDocuments({ branchId, isPublic: true })
      : 0,
  ]);
  return { services, products, packages, memberships, staff, gallery, offers };
}

async function getAggregateRating(businessModels, branchId) {
  const { Feedback } = businessModels;
  if (!Feedback) return null;
  const rows = await Feedback.aggregate([
    { $match: { branchId, rating: { $gte: 1 } } },
    {
      $group: {
        _id: null,
        avg: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);
  if (!rows[0]?.count) return null;
  return {
    average: Math.round(rows[0].avg * 10) / 10,
    count: rows[0].count,
  };
}

async function buildSiteProfile(business, businessModels) {
  const website = business.settings?.website || {};
  const visibility = {
    showPrices: website.visibility?.showPrices !== false,
    showServices: website.visibility?.showServices !== false,
    showStaff: website.visibility?.showStaff !== false,
    showProducts: website.visibility?.showProducts !== false,
    retailProductsOnly: website.visibility?.retailProductsOnly === true,
    showProductPrices:
      typeof website.visibility?.showProductPrices === 'boolean'
        ? website.visibility.showProductPrices
        : website.visibility?.showPrices !== false,
    showProductImages: website.visibility?.showProductImages !== false,
    showPackages: website.visibility?.showPackages !== false,
    showMemberships: website.visibility?.showMemberships === true,
    showPrepaidWallets: website.visibility?.showPrepaidWallets === true,
    showOffers: website.visibility?.showOffers !== false,
    showGallery: website.visibility?.showGallery !== false,
    showReviews: website.visibility?.showReviews !== false,
  };
  const extras = await loadBusinessSettingsForSite(businessModels, business);
  const counts = await getPublicCounts(businessModels, business._id, visibility);
  const rating = visibility.showReviews
    ? await getAggregateRating(businessModels, business._id)
    : null;
  return serializeSiteProfile(business, {
    ...extras,
    counts,
    rating,
    onlineBookingFeature: hasFeature(business, 'online_booking'),
  });
}

function publicServiceQuery(branchId) {
  return {
    branchId,
    isActive: { $ne: false },
    isPublic: true,
  };
}

async function listServices(businessModels, branchId, { featuredOnly = false, showPrices = true } = {}) {
  const { Service } = businessModels;
  const q = publicServiceQuery(branchId);
  if (featuredOnly) q.isFeatured = true;
  const rows = await Service.find(q)
    .sort({ displayOrder: 1, isFeatured: -1, name: 1 })
    .lean();
  return rows.map((s) => serializeService(s, { showPrices }));
}

async function getServiceBySlug(businessModels, branchId, serviceSlug, { showPrices = true } = {}) {
  const { Service } = businessModels;
  const slug = String(serviceSlug || '').toLowerCase();
  const rows = await Service.find(publicServiceQuery(branchId)).lean();
  const match = rows.find((s) => ensureSlug(s) === slug || String(s._id) === slug);
  if (!match) return null;
  return serializeService(match, { showPrices });
}

async function bookableServiceIdsForPackage(businessModels, branchId, packageId) {
  const { PackageService, Service } = businessModels;
  if (!PackageService) return [];
  const links = await PackageService.find({ package_id: packageId, branchId }).lean();
  const serviceIds = links.map((l) => l.service_id).filter(Boolean);
  if (!serviceIds.length) return [];
  const bookable = await Service.find({
    _id: { $in: serviceIds },
    branchId,
    isActive: { $ne: false },
    showInOnlineBooking: { $ne: false },
    $or: [{ serviceKind: { $exists: false } }, { serviceKind: 'simple' }, { serviceKind: null }],
  })
    .select('_id')
    .lean();
  return bookable.map((s) => String(s._id));
}

async function listPackages(businessModels, branchId, { featuredOnly = false, showPrices = true } = {}) {
  const { Package } = businessModels;
  const q = { branchId, status: 'ACTIVE', isPublic: true };
  if (featuredOnly) q.isFeatured = true;
  const rows = await Package.find(q).sort({ displayOrder: 1, name: 1 }).lean();
  const out = [];
  for (const pkg of rows) {
    const bookableServiceIds = await bookableServiceIdsForPackage(businessModels, branchId, pkg._id);
    out.push(serializePackage(pkg, { showPrices, bookableServiceIds }));
  }
  return out;
}

async function getPackageBySlug(businessModels, branchId, packageSlug, { showPrices = true } = {}) {
  const { Package } = businessModels;
  const slug = String(packageSlug || '').toLowerCase();
  const rows = await Package.find({ branchId, status: 'ACTIVE', isPublic: true }).lean();
  const match = rows.find((p) => ensureSlug(p) === slug || String(p._id) === slug);
  if (!match) return null;
  const bookableServiceIds = await bookableServiceIdsForPackage(businessModels, branchId, match._id);
  return serializePackage(match, { showPrices, bookableServiceIds });
}

async function listProducts(
  businessModels,
  branchId,
  { featuredOnly = false, showPrices = true, visibility = {} } = {}
) {
  const { Product } = businessModels;
  const q = productPublicQuery(branchId, visibility);
  if (featuredOnly) q.isFeatured = true;
  const rows = await Product.find(q).sort({ displayOrder: 1, name: 1 }).lean();
  return rows.map((p) => serializeProduct(p, { showPrices }));
}

async function getProductBySlug(
  businessModels,
  branchId,
  productSlug,
  { showPrices = true, visibility = {} } = {}
) {
  const { Product } = businessModels;
  const slug = String(productSlug || '').toLowerCase();
  const rows = await Product.find(productPublicQuery(branchId, visibility)).lean();
  const match = rows.find((p) => ensureSlug(p) === slug || String(p._id) === slug);
  return match ? serializeProduct(match, { showPrices }) : null;
}

async function listMemberships(businessModels, branchId, { featuredOnly = false, showPrices = true } = {}) {
  const { MembershipPlan } = businessModels;
  const q = { branchId, isActive: true, isPublic: true };
  if (featuredOnly) q.isFeatured = true;
  const rows = await MembershipPlan.find(q).sort({ displayOrder: 1, planName: 1 }).lean();
  return rows.map((m) => serializeMembership(m, { showPrices }));
}

async function getMembershipBySlug(businessModels, branchId, planSlug, { showPrices = true } = {}) {
  const { MembershipPlan } = businessModels;
  const slug = String(planSlug || '').toLowerCase();
  const rows = await MembershipPlan.find({ branchId, isActive: true, isPublic: true }).lean();
  const match = rows.find((m) => ensureSlug(m, 'planName') === slug || String(m._id) === slug);
  return match ? serializeMembership(match, { showPrices }) : null;
}

async function listPrepaidWallets(businessModels, branchId, { featuredOnly = false, showPrices = true } = {}) {
  const { PrepaidPlan } = businessModels;
  if (!PrepaidPlan) return [];
  const q = { branchId, status: 'active', isPublic: true };
  if (featuredOnly) q.isFeatured = true;
  const rows = await PrepaidPlan.find(q).sort({ displayOrder: 1, name: 1 }).lean();
  return rows.map((p) => serializePrepaidPlan(p, { showPrices }));
}

async function listTeam(businessModels, branchId) {
  const { Staff } = businessModels;
  const rows = await Staff.find({ branchId, isActive: { $ne: false }, isPublic: true })
    .sort({ displayOrder: 1, name: 1 })
    .select('name avatar specialties role title shortDescription isFeatured displayOrder slug')
    .lean();
  return rows.map(serializeStaff);
}

async function listGallery(businessModels, branchId, business) {
  const { WebsiteGallery } = businessModels;
  if (WebsiteGallery) {
    const rows = await WebsiteGallery.find({ branchId, isPublic: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    if (rows.length) return rows.map(serializeGalleryItem);
  }
  const showcase = business.settings?.appointmentSettings?.showcaseImages || [];
  return showcase.filter(Boolean).map((url, i) => ({
    id: `showcase-${i}`,
    title: '',
    imageUrl: url,
    alt: business.name || 'Gallery',
    isFeatured: i === 0,
    displayOrder: i,
  }));
}

async function listOffers(businessModels, branchId) {
  const { WebsiteOffer } = businessModels;
  if (!WebsiteOffer) return [];
  const now = new Date();
  const rows = await WebsiteOffer.find({ branchId, isPublic: true })
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();
  return rows
    .filter((o) => {
      if (o.startDate && new Date(o.startDate) > now) return false;
      if (o.endDate && new Date(o.endDate) < now) return false;
      return true;
    })
    .map(serializeOffer);
}

async function listReviews(businessModels, branchId, { limit = 20 } = {}) {
  const { Feedback, GmbReview } = businessModels;
  const out = [];
  if (Feedback) {
    const feedback = await Feedback.find({
      branchId,
      rating: { $gte: 4 },
      reviewText: { $exists: true, $ne: '' },
    })
      .sort({ submittedAt: -1 })
      .limit(limit)
      .lean();
    out.push(...feedback.map(serializeReview));
  }
  if (GmbReview && out.length < limit) {
    const gmb = await GmbReview.find({
      starRating: { $gte: 4 },
      comment: { $exists: true, $ne: '' },
    })
      .sort({ createTime: -1 })
      .limit(limit - out.length)
      .lean();
    out.push(...gmb.map(serializeReview));
  }
  return out.slice(0, limit);
}

function showPricesFromBusiness(business) {
  return business.settings?.website?.visibility?.showPrices !== false;
}

function productPublicQuery(branchId, visibility, extra = {}) {
  const q = { branchId, isActive: { $ne: false }, isPublic: true, ...extra };
  if (visibility?.retailProductsOnly) {
    q.productType = { $in: ['retail', 'both'] };
  }
  return q;
}

function showProductPricesFromBusiness(business) {
  const website = business?.settings?.website || {};
  const v = website.visibility || {};
  if (typeof v.showProductPrices === 'boolean') return v.showProductPrices;
  return v.showPrices !== false;
}

function productVisibilityFromBusiness(business) {
  const website = business?.settings?.website || {};
  const v = website.visibility || {};
  return {
    retailProductsOnly: v.retailProductsOnly === true,
    showProductPrices:
      typeof v.showProductPrices === 'boolean' ? v.showProductPrices : v.showPrices !== false,
  };
}

module.exports = {
  buildSiteProfile,
  listServices,
  getServiceBySlug,
  listPackages,
  getPackageBySlug,
  listProducts,
  getProductBySlug,
  listMemberships,
  getMembershipBySlug,
  listPrepaidWallets,
  listTeam,
  listGallery,
  listOffers,
  listReviews,
  showPricesFromBusiness,
  showProductPricesFromBusiness,
  productVisibilityFromBusiness,
  productPublicQuery,
  bookableServiceIdsForPackage,
  slugify,
};
