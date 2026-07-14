'use strict';

/**
 * Tenant mini-website settings (Business.settings.website + slug).
 */

const express = require('express');
const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const { hasFeature } = require('../lib/entitlements');
const { isValidTenantSlug, isReservedSlug } = require('../lib/slug-helper');
const { miniSiteBasePath } = require('../lib/mini-site-path');
const { defaultWebsiteSettings } = require('../lib/site-serializers');
const { normalizeCustomFieldList } = require('../lib/website-enquiry-fields');
const {
  sanitizeBookingHeroTheme,
  accentForBookingHeroTheme,
  resolveBookingHeroThemeForBusiness,
} = require('../lib/booking-hero-themes');

const router = express.Router();

async function loadBusiness(branchId) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  return Business.findById(branchId);
}

function sanitizeCoverImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => (typeof img === 'string' ? img.trim().slice(0, 2_000_000) : ''))
    .filter(Boolean)
    .slice(0, 8);
}

function formatResponse(business) {
  const website = defaultWebsiteSettings(business.settings?.website || {});
  const planAllows = hasFeature(business, 'mini_website');
  return {
    code: business.code,
    name: business.name,
    slug: business.slug || '',
    publicPath: miniSiteBasePath(business.slug || String(business.code).toLowerCase()),
    available: planAllows,
    enabled: planAllows && Boolean(business.settings?.website?.enabled),
    coverImage: website.coverImage,
    coverImages: website.coverImages,
    tagline: website.tagline,
    description: website.description,
    themeColor: website.themeColor,
    bookingHeroTheme: resolveBookingHeroThemeForBusiness(business),
    businessCategory: website.businessCategory,
    seo: website.seo,
    social: website.social,
    contact: website.contact,
    visibility: website.visibility,
    featured: website.featured,
    externalAnalytics: website.externalAnalytics,
    enquiryForm: website.enquiryForm,
  };
}

router.get('/', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'Business context not found' });
    }
    const business = await loadBusiness(branchId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    res.json({ success: true, data: formatResponse(business.toObject ? business.toObject() : business) });
  } catch (error) {
    logger.error('[settings/website] GET', error);
    res.status(500).json({ success: false, error: 'Failed to load website settings' });
  }
});

router.post('/slug-available', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const slug = String(req.body?.slug || '')
      .trim()
      .toLowerCase();
    if (!isValidTenantSlug(slug)) {
      return res.json({
        success: true,
        data: { available: false, reason: isReservedSlug(slug) ? 'reserved' : 'invalid' },
      });
    }
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const existing = await Business.findOne({
      $or: [{ slug }, { slugAliases: slug }, { code: slug.toUpperCase() }],
      _id: { $ne: req.user.branchId },
    })
      .select('_id')
      .lean();
    res.json({ success: true, data: { available: !existing } });
  } catch (error) {
    logger.error('[settings/website] slug-available', error);
    res.status(500).json({ success: false, error: 'Failed to check slug' });
  }
});

router.put('/', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'Business context not found' });
    }
    const business = await loadBusiness(branchId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    if (!hasFeature(business, 'mini_website')) {
      return res.status(403).json({ success: false, error: 'Mini website is not on your plan' });
    }

    const body = req.body || {};
    if (!business.settings) business.settings = {};
    if (!business.settings.website) business.settings.website = {};
    const w = business.settings.website;

    if (typeof body.enabled === 'boolean') w.enabled = body.enabled;
    if (typeof body.coverImage === 'string') w.coverImage = body.coverImage.slice(0, 2_000_000);
    if (Array.isArray(body.coverImages)) {
      w.coverImages = sanitizeCoverImages(body.coverImages);
      w.coverImage = w.coverImages[0] || '';
    } else if (typeof body.coverImage === 'string' && body.coverImage) {
      w.coverImages = [w.coverImage];
    }
    if (typeof body.tagline === 'string') w.tagline = body.tagline.slice(0, 200);
    if (typeof body.description === 'string') w.description = body.description.slice(0, 2000);
    if (typeof body.themeColor === 'string') w.themeColor = body.themeColor.slice(0, 32);
    if (body.bookingHeroTheme != null) {
      const themeId = sanitizeBookingHeroTheme(body.bookingHeroTheme);
      if (!business.settings.appointmentSettings) business.settings.appointmentSettings = {};
      business.settings.appointmentSettings.bookingHeroTheme = themeId;
      w.themeColor = accentForBookingHeroTheme(themeId);
    }
    if (typeof body.businessCategory === 'string') w.businessCategory = body.businessCategory.slice(0, 80);

    if (body.seo && typeof body.seo === 'object') {
      w.seo = w.seo || {};
      if (typeof body.seo.title === 'string') w.seo.title = body.seo.title.slice(0, 120);
      if (typeof body.seo.metaDescription === 'string')
        w.seo.metaDescription = body.seo.metaDescription.slice(0, 320);
      if (typeof body.seo.ogImage === 'string') w.seo.ogImage = body.seo.ogImage.slice(0, 2_000_000);
    }
    if (body.social && typeof body.social === 'object') {
      w.social = w.social || {};
      for (const key of ['instagram', 'facebook', 'googleMapsUrl', 'googleProfileUrl']) {
        if (typeof body.social[key] === 'string') w.social[key] = body.social[key].slice(0, 500);
      }
    }
    if (body.contact && typeof body.contact === 'object') {
      w.contact = w.contact || {};
      if (typeof body.contact.whatsappNumber === 'string')
        w.contact.whatsappNumber = body.contact.whatsappNumber.slice(0, 20);
      if (typeof body.contact.callNumber === 'string')
        w.contact.callNumber = body.contact.callNumber.slice(0, 20);
    }
    if (body.visibility && typeof body.visibility === 'object') {
      w.visibility = w.visibility || {};
      for (const key of [
        'showPrices',
        'showServices',
        'showStaff',
        'showProducts',
        'retailProductsOnly',
        'showProductPrices',
        'showProductImages',
        'showPackages',
        'showMemberships',
        'showPrepaidWallets',
        'showOffers',
        'showGallery',
        'showReviews',
      ]) {
        if (typeof body.visibility[key] === 'boolean') w.visibility[key] = body.visibility[key];
      }
    }
    if (body.featured && typeof body.featured === 'object') {
      w.featured = w.featured || {};
      for (const key of ['serviceIds', 'packageIds', 'productIds', 'membershipIds']) {
        if (Array.isArray(body.featured[key])) {
          w.featured[key] = body.featured[key].map(String).slice(0, 50);
        }
      }
    }
    if (body.externalAnalytics && typeof body.externalAnalytics === 'object') {
      w.externalAnalytics = w.externalAnalytics || {};
      for (const key of ['gaMeasurementId', 'metaPixelId', 'plausibleDomain']) {
        if (typeof body.externalAnalytics[key] === 'string') {
          w.externalAnalytics[key] = body.externalAnalytics[key].slice(0, 120);
        }
      }
    }
    if (body.enquiryForm && typeof body.enquiryForm === 'object') {
      w.enquiryForm = w.enquiryForm || {};
      if (Array.isArray(body.enquiryForm.customFields)) {
        w.enquiryForm.customFields = normalizeCustomFieldList(body.enquiryForm.customFields);
      }
    }

    if (typeof body.slug === 'string') {
      const nextSlug = body.slug.trim().toLowerCase();
      if (nextSlug) {
        if (!isValidTenantSlug(nextSlug)) {
          return res.status(400).json({ success: false, error: 'Invalid or reserved slug' });
        }
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('../models/Business').schema);
        const clash = await Business.findOne({
          $or: [{ slug: nextSlug }, { slugAliases: nextSlug }],
          _id: { $ne: business._id },
        })
          .select('_id')
          .lean();
        if (clash) {
          return res.status(400).json({ success: false, error: 'Slug is already taken' });
        }
        const prev = business.slug;
        if (prev && prev !== nextSlug) {
          const aliases = new Set(business.slugAliases || []);
          aliases.add(prev);
          business.slugAliases = [...aliases];
        }
        business.slug = nextSlug;
      }
    }

    business.markModified('settings');
    await business.save();
    res.json({ success: true, data: formatResponse(business.toObject()) });
  } catch (error) {
    logger.error('[settings/website] PUT', error);
    res.status(500).json({ success: false, error: 'Failed to save website settings' });
  }
});

/** First-party analytics summary for the last N days. */
router.get('/analytics', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'Business context not found' });
    }
    const business = await loadBusiness(branchId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    if (!hasFeature(business, 'mini_website')) {
      return res.status(403).json({ success: false, error: 'Mini website is not on your plan' });
    }

    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const mainConnection = await databaseManager.getMainConnection();
    const WebsiteAnalyticsEvent = mainConnection.model(
      'WebsiteAnalyticsEvent',
      require('../models/WebsiteAnalyticsEvent').schema
    );

    const rows = await WebsiteAnalyticsEvent.aggregate([
      { $match: { businessId: business._id, createdAt: { $gte: since } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
    ]);

    const byEvent = {};
    for (const row of rows) byEvent[row._id] = row.count;

    res.json({
      success: true,
      data: {
        days,
        since,
        byEvent,
        total: rows.reduce((sum, r) => sum + r.count, 0),
      },
    });
  } catch (error) {
    logger.error('[settings/website] analytics', error);
    res.status(500).json({ success: false, error: 'Failed to load analytics' });
  }
});

const CATALOG_TYPES = {
  services: { model: 'Service', query: (branchId) => ({ branchId, isActive: { $ne: false } }) },
  products: { model: 'Product', query: (branchId) => ({ branchId, isActive: { $ne: false } }) },
  packages: { model: 'Package', query: (branchId) => ({ branchId, status: 'ACTIVE' }) },
  memberships: { model: 'MembershipPlan', query: (branchId) => ({ branchId, isActive: true }) },
  'prepaid-wallets': { model: 'PrepaidPlan', query: (branchId) => ({ branchId, status: 'active' }) },
};

function catalogSelectFields(type) {
  const base = 'isPublic isFeatured displayOrder';
  if (type === 'services') return `${base} name category price duration`;
  if (type === 'products') return `${base} name category price productType`;
  if (type === 'packages') return `${base} name type price`;
  if (type === 'memberships') return `${base} planName price durationInDays`;
  if (type === 'prepaid-wallets') return `${base} name payAmount creditAmount validityDays`;
  return `${base} name`;
}

function catalogItemName(row, type) {
  if (type === 'memberships') return row.planName || '';
  return row.name || '';
}

function catalogSort(type) {
  const nameField = type === 'memberships' ? 'planName' : 'name';
  return { displayOrder: 1, [nameField]: 1 };
}

router.get('/catalog/:type', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const cfg = CATALOG_TYPES[type];
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Invalid catalog type' });
    }
    const branchId = req.user?.branchId;
    const Model = req.businessModels[cfg.model];
    if (!Model) {
      return res.status(400).json({ success: false, error: 'Catalog not available' });
    }
    let query = cfg.query(branchId);
    if (type === 'products') {
      const business = await loadBusiness(branchId);
      const website = defaultWebsiteSettings(business?.settings?.website || {});
      if (website.visibility.retailProductsOnly) {
        query = { ...query, productType: { $in: ['retail', 'both'] } };
      }
    }
    const rows = await Model.find(query)
      .select(catalogSelectFields(type))
      .sort(catalogSort(type))
      .lean();
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: String(row._id),
        name: catalogItemName(row, type),
        isPublic: Boolean(row.isPublic),
        isFeatured: Boolean(row.isFeatured),
        meta: {
          category: row.category,
          productType: row.productType,
          type: row.type,
          price: row.price,
          payAmount: row.payAmount,
          creditAmount: row.creditAmount,
          duration: row.duration,
          validityDays: row.durationInDays ?? row.validityDays,
        },
      })),
    });
  } catch (error) {
    logger.error('[settings/website] catalog GET', error);
    res.status(500).json({ success: false, error: 'Failed to load catalog' });
  }
});

router.patch('/catalog/:type/bulk', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const cfg = CATALOG_TYPES[type];
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Invalid catalog type' });
    }
    if (typeof req.body?.isPublic !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isPublic boolean is required' });
    }
    const branchId = req.user?.branchId;
    const Model = req.businessModels[cfg.model];
    if (!Model) {
      return res.status(400).json({ success: false, error: 'Catalog not available' });
    }
    let query = cfg.query(branchId);
    if (type === 'products') {
      const business = await loadBusiness(branchId);
      const website = defaultWebsiteSettings(business?.settings?.website || {});
      if (website.visibility.retailProductsOnly) {
        query = { ...query, productType: { $in: ['retail', 'both'] } };
      }
    }
    const result = await Model.updateMany(query, { $set: { isPublic: req.body.isPublic } });
    res.json({ success: true, data: { updated: result.modifiedCount || 0, isPublic: req.body.isPublic } });
  } catch (error) {
    logger.error('[settings/website] catalog bulk PATCH', error);
    res.status(500).json({ success: false, error: 'Failed to bulk update catalog' });
  }
});

router.patch('/catalog/:type/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const cfg = CATALOG_TYPES[type];
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Invalid catalog type' });
    }
    const branchId = req.user?.branchId;
    const Model = req.businessModels[cfg.model];
    if (!Model) {
      return res.status(400).json({ success: false, error: 'Catalog not available' });
    }
    const patch = {};
    if (typeof req.body?.isPublic === 'boolean') patch.isPublic = req.body.isPublic;
    if (typeof req.body?.isFeatured === 'boolean') patch.isFeatured = req.body.isFeatured;
    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    const updated = await Model.findOneAndUpdate(
      { _id: req.params.id, ...cfg.query(branchId) },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({
      success: true,
      data: {
        id: String(updated._id),
        name: catalogItemName(updated, type),
        isPublic: Boolean(updated.isPublic),
        isFeatured: Boolean(updated.isFeatured),
      },
    });
  } catch (error) {
    logger.error('[settings/website] catalog PATCH', error);
    res.status(500).json({ success: false, error: 'Failed to update catalog item' });
  }
});

router.get('/offers', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteOffer } = req.businessModels;
    if (!WebsiteOffer) return res.json({ success: true, data: [] });
    const rows = await WebsiteOffer.find({ branchId: req.user.branchId })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({
      success: true,
      data: rows.map((o) => ({
        id: String(o._id),
        title: o.title || '',
        shortDescription: o.shortDescription || '',
        imageUrl: o.imageUrl || '',
        ctaLabel: o.ctaLabel || '',
        ctaHref: o.ctaHref || '',
        isPublic: Boolean(o.isPublic),
        isFeatured: Boolean(o.isFeatured),
        displayOrder: o.displayOrder || 0,
      })),
    });
  } catch (error) {
    logger.error('[settings/website] offers GET', error);
    res.status(500).json({ success: false, error: 'Failed to load offers' });
  }
});

router.post('/offers', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteOffer } = req.businessModels;
    if (!WebsiteOffer) {
      return res.status(400).json({ success: false, error: 'Offers not available' });
    }
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
    const created = await WebsiteOffer.create({
      branchId: req.user.branchId,
      title,
      shortDescription: String(body.shortDescription || '').slice(0, 500),
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl.slice(0, 2_000_000) : '',
      ctaLabel: String(body.ctaLabel || 'Learn more').slice(0, 80),
      ctaHref: String(body.ctaHref || '').slice(0, 500),
      isPublic: body.isPublic !== false,
      isFeatured: Boolean(body.isFeatured),
      displayOrder: Number(body.displayOrder) || 0,
    });
    res.json({ success: true, data: { id: String(created._id) } });
  } catch (error) {
    logger.error('[settings/website] offers POST', error);
    res.status(500).json({ success: false, error: 'Failed to create offer' });
  }
});

router.put('/offers/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteOffer } = req.businessModels;
    if (!WebsiteOffer) {
      return res.status(400).json({ success: false, error: 'Offers not available' });
    }
    const body = req.body || {};
    const patch = {};
    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 120);
    if (typeof body.shortDescription === 'string') patch.shortDescription = body.shortDescription.slice(0, 500);
    if (typeof body.imageUrl === 'string') patch.imageUrl = body.imageUrl.slice(0, 2_000_000);
    if (typeof body.ctaLabel === 'string') patch.ctaLabel = body.ctaLabel.slice(0, 80);
    if (typeof body.ctaHref === 'string') patch.ctaHref = body.ctaHref.slice(0, 500);
    if (typeof body.isPublic === 'boolean') patch.isPublic = body.isPublic;
    if (typeof body.isFeatured === 'boolean') patch.isFeatured = body.isFeatured;
    if (body.displayOrder != null) patch.displayOrder = Number(body.displayOrder) || 0;
    const updated = await WebsiteOffer.findOneAndUpdate(
      { _id: req.params.id, branchId: req.user.branchId },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Offer not found' });
    res.json({ success: true, data: { id: String(updated._id) } });
  } catch (error) {
    logger.error('[settings/website] offers PUT', error);
    res.status(500).json({ success: false, error: 'Failed to update offer' });
  }
});

router.delete('/offers/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteOffer } = req.businessModels;
    if (!WebsiteOffer) {
      return res.status(400).json({ success: false, error: 'Offers not available' });
    }
    const deleted = await WebsiteOffer.findOneAndDelete({
      _id: req.params.id,
      branchId: req.user.branchId,
    });
    if (!deleted) return res.status(404).json({ success: false, error: 'Offer not found' });
    res.json({ success: true });
  } catch (error) {
    logger.error('[settings/website] offers DELETE', error);
    res.status(500).json({ success: false, error: 'Failed to delete offer' });
  }
});

router.get('/gallery', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteGallery } = req.businessModels;
    if (!WebsiteGallery) return res.json({ success: true, data: [] });
    const rows = await WebsiteGallery.find({ branchId: req.user.branchId })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({
      success: true,
      data: rows.map((g) => ({
        id: String(g._id),
        title: g.title || '',
        imageUrl: g.imageUrl || '',
        alt: g.alt || '',
        isPublic: Boolean(g.isPublic),
        isFeatured: Boolean(g.isFeatured),
        displayOrder: g.displayOrder || 0,
      })),
    });
  } catch (error) {
    logger.error('[settings/website] gallery GET', error);
    res.status(500).json({ success: false, error: 'Failed to load gallery' });
  }
});

router.post('/gallery', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteGallery } = req.businessModels;
    if (!WebsiteGallery) {
      return res.status(400).json({ success: false, error: 'Gallery not available' });
    }
    const body = req.body || {};
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
    if (!imageUrl) return res.status(400).json({ success: false, error: 'Image is required' });
    const created = await WebsiteGallery.create({
      branchId: req.user.branchId,
      title: String(body.title || '').slice(0, 120),
      imageUrl: imageUrl.slice(0, 2_000_000),
      alt: String(body.alt || '').slice(0, 200),
      isPublic: body.isPublic !== false,
      isFeatured: Boolean(body.isFeatured),
      displayOrder: Number(body.displayOrder) || 0,
    });
    res.json({ success: true, data: { id: String(created._id) } });
  } catch (error) {
    logger.error('[settings/website] gallery POST', error);
    res.status(500).json({ success: false, error: 'Failed to add gallery image' });
  }
});

router.put('/gallery/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteGallery } = req.businessModels;
    if (!WebsiteGallery) {
      return res.status(400).json({ success: false, error: 'Gallery not available' });
    }
    const body = req.body || {};
    const patch = {};
    if (typeof body.title === 'string') patch.title = body.title.slice(0, 120);
    if (typeof body.imageUrl === 'string') patch.imageUrl = body.imageUrl.slice(0, 2_000_000);
    if (typeof body.alt === 'string') patch.alt = body.alt.slice(0, 200);
    if (typeof body.isPublic === 'boolean') patch.isPublic = body.isPublic;
    if (typeof body.isFeatured === 'boolean') patch.isFeatured = body.isFeatured;
    if (body.displayOrder != null) patch.displayOrder = Number(body.displayOrder) || 0;
    const updated = await WebsiteGallery.findOneAndUpdate(
      { _id: req.params.id, branchId: req.user.branchId },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Gallery item not found' });
    res.json({ success: true, data: { id: String(updated._id) } });
  } catch (error) {
    logger.error('[settings/website] gallery PUT', error);
    res.status(500).json({ success: false, error: 'Failed to update gallery item' });
  }
});

router.delete('/gallery/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteGallery } = req.businessModels;
    if (!WebsiteGallery) {
      return res.status(400).json({ success: false, error: 'Gallery not available' });
    }
    const deleted = await WebsiteGallery.findOneAndDelete({
      _id: req.params.id,
      branchId: req.user.branchId,
    });
    if (!deleted) return res.status(404).json({ success: false, error: 'Gallery item not found' });
    res.json({ success: true });
  } catch (error) {
    logger.error('[settings/website] gallery DELETE', error);
    res.status(500).json({ success: false, error: 'Failed to delete gallery item' });
  }
});

const ENQUIRY_STATUSES = new Set(['new', 'contacted', 'converted', 'closed']);
const ENQUIRY_TYPE_LABELS = {
  bridal: 'Bridal',
  package: 'Package',
  membership: 'Membership',
  product: 'Product',
  general: 'General',
};

async function resolveEnquiryRelated(businessModels, row) {
  const { Service, Package, Product, MembershipPlan } = businessModels;
  if (row.relatedServiceId && Service) {
    const doc = await Service.findById(row.relatedServiceId).select('name').lean();
    if (doc) return { kind: 'service', id: String(row.relatedServiceId), name: doc.name || '' };
  }
  if (row.relatedPackageId && Package) {
    const doc = await Package.findById(row.relatedPackageId).select('name').lean();
    if (doc) return { kind: 'package', id: String(row.relatedPackageId), name: doc.name || '' };
  }
  if (row.relatedProductId && Product) {
    const doc = await Product.findById(row.relatedProductId).select('name').lean();
    if (doc) return { kind: 'product', id: String(row.relatedProductId), name: doc.name || '' };
  }
  if (row.relatedMembershipId && MembershipPlan) {
    const doc = await MembershipPlan.findById(row.relatedMembershipId).select('planName').lean();
    if (doc) return { kind: 'membership', id: String(row.relatedMembershipId), name: doc.planName || '' };
  }
  return null;
}

function serializeEnquiryRow(row, related) {
  return {
    id: String(row._id),
    type: row.type || 'general',
    typeLabel: ENQUIRY_TYPE_LABELS[row.type] || 'General',
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    city: row.city || '',
    message: row.message || '',
    customFields:
      row.customFields && typeof row.customFields === 'object' && !Array.isArray(row.customFields)
        ? row.customFields
        : {},
    related,
    leadId: row.leadId ? String(row.leadId) : null,
    status: row.status || 'new',
    createdAt: row.createdAt || null,
  };
}

router.get('/enquiries', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteEnquiry } = req.businessModels;
    if (!WebsiteEnquiry) {
      return res.json({ success: true, data: { enquiries: [], total: 0 } });
    }
    const branchId = req.user.branchId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const query = { branchId };
    if (req.query.status && ENQUIRY_STATUSES.has(String(req.query.status))) {
      query.status = String(req.query.status);
    }
    if (req.query.type && ENQUIRY_TYPE_LABELS[String(req.query.type)]) {
      query.type = String(req.query.type);
    }
    const [rows, total] = await Promise.all([
      WebsiteEnquiry.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      WebsiteEnquiry.countDocuments(query),
    ]);
    const enquiries = [];
    for (const row of rows) {
      const related = await resolveEnquiryRelated(req.businessModels, row);
      enquiries.push(serializeEnquiryRow(row, related));
    }
    res.json({ success: true, data: { enquiries, total } });
  } catch (error) {
    logger.error('[settings/website] enquiries GET', error);
    res.status(500).json({ success: false, error: 'Failed to load enquiries' });
  }
});

router.patch('/enquiries/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { WebsiteEnquiry } = req.businessModels;
    if (!WebsiteEnquiry) {
      return res.status(400).json({ success: false, error: 'Enquiries not available' });
    }
    const status = String(req.body?.status || '');
    if (!ENQUIRY_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const updated = await WebsiteEnquiry.findOneAndUpdate(
      { _id: req.params.id, branchId: req.user.branchId },
      { $set: { status } },
      { new: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Enquiry not found' });
    }
    const related = await resolveEnquiryRelated(req.businessModels, updated);
    res.json({ success: true, data: serializeEnquiryRow(updated, related) });
  } catch (error) {
    logger.error('[settings/website] enquiries PATCH', error);
    res.status(500).json({ success: false, error: 'Failed to update enquiry' });
  }
});

module.exports = router;
