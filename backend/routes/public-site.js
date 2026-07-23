'use strict';

/**
 * Public salon mini-website API — no auth; gated by settings.website.enabled + mini_website feature.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { setupMainDatabase } = require('../middleware/business-db');
const { setupPublicSiteBySlug } = require('../middleware/public-site-resolver');
const { logger } = require('../utils/logger');
const siteService = require('../lib/public-site-service');
const { notifyWebsiteProductRequest } = require('../lib/notify-website-product-request');
const {
  validateSubmittedCustomFields,
  formatCustomFieldsForNotes,
} = require('../lib/website-enquiry-fields');
const { WEBSITE_ANALYTICS_EVENTS } = require('../models/WebsiteAnalyticsEvent');
const databaseManager = require('../config/database-manager');

const router = express.Router({ mergeParams: true });

function skipRateLimit() {
  return process.env.NODE_ENV === 'development' || process.env.PUBLIC_SITE_RATE_LIMIT === '0';
}

const rateLimitDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  skipFailedRequests: true,
  message: { success: false, error: 'Too many requests. Please try again later.' },
};

const readLimiter = rateLimit({ ...rateLimitDefaults, windowMs: 15 * 60 * 1000, max: 400 });
const writeLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 40,
  skipFailedRequests: false,
});
const trackLimiter = rateLimit({ ...rateLimitDefaults, windowMs: 15 * 60 * 1000, max: 600 });

const resolveTenant = [setupMainDatabase, setupPublicSiteBySlug];

function visibility(req) {
  return req.businessDoc.settings?.website?.visibility || {};
}

function showPrices(req) {
  return siteService.showPricesFromBusiness(req.businessDoc);
}

function productVisibility(req) {
  return siteService.productVisibilityFromBusiness(req.businessDoc);
}

function showProductPrices(req) {
  return siteService.showProductPricesFromBusiness(req.businessDoc);
}

router.get('/profile', readLimiter, resolveTenant, async (req, res) => {
  try {
    const data = await siteService.buildSiteProfile(req.businessDoc, req.businessModels);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('[public-site] profile', error);
    res.status(500).json({ success: false, error: 'Could not load salon profile.' });
  }
});

router.get('/services', readLimiter, resolveTenant, async (req, res) => {
  try {
    const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
    const services = await siteService.listServices(req.businessModels, req.branchId, {
      featuredOnly,
      showPrices: showPrices(req),
    });
    res.json({ success: true, data: { services } });
  } catch (error) {
    logger.error('[public-site] services', error);
    res.status(500).json({ success: false, error: 'Could not load services.' });
  }
});

router.get('/services/:serviceSlug', readLimiter, resolveTenant, async (req, res) => {
  try {
    const service = await siteService.getServiceBySlug(
      req.businessModels,
      req.branchId,
      req.params.serviceSlug,
      { showPrices: showPrices(req) }
    );
    if (!service) return res.status(404).json({ success: false, error: 'Service not found.' });
    res.json({ success: true, data: { service } });
  } catch (error) {
    logger.error('[public-site] service detail', error);
    res.status(500).json({ success: false, error: 'Could not load service.' });
  }
});

router.get('/packages', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showPackages === false) {
      return res.json({ success: true, data: { packages: [] } });
    }
    const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
    const packages = await siteService.listPackages(req.businessModels, req.branchId, {
      featuredOnly,
      showPrices: showPrices(req),
    });
    res.json({ success: true, data: { packages } });
  } catch (error) {
    logger.error('[public-site] packages', error);
    res.status(500).json({ success: false, error: 'Could not load packages.' });
  }
});

router.get('/packages/:packageSlug', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showPackages === false) {
      return res.status(404).json({ success: false, error: 'Package not found.' });
    }
    const pkg = await siteService.getPackageBySlug(
      req.businessModels,
      req.branchId,
      req.params.packageSlug,
      { showPrices: showPrices(req) }
    );
    if (!pkg) return res.status(404).json({ success: false, error: 'Package not found.' });
    res.json({ success: true, data: { package: pkg } });
  } catch (error) {
    logger.error('[public-site] package detail', error);
    res.status(500).json({ success: false, error: 'Could not load package.' });
  }
});

router.get('/products', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showProducts === false) {
      return res.json({ success: true, data: { products: [] } });
    }
    const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
    const products = await siteService.listProducts(req.businessModels, req.branchId, {
      featuredOnly,
      showPrices: showProductPrices(req),
      visibility: productVisibility(req),
    });
    res.json({ success: true, data: { products } });
  } catch (error) {
    logger.error('[public-site] products', error);
    res.status(500).json({ success: false, error: 'Could not load products.' });
  }
});

router.get('/products/:productSlug', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showProducts === false) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    const product = await siteService.getProductBySlug(
      req.businessModels,
      req.branchId,
      req.params.productSlug,
      { showPrices: showProductPrices(req), visibility: productVisibility(req) }
    );
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
    res.json({ success: true, data: { product } });
  } catch (error) {
    logger.error('[public-site] product detail', error);
    res.status(500).json({ success: false, error: 'Could not load product.' });
  }
});

router.get('/memberships', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showMemberships !== true) {
      return res.json({ success: true, data: { memberships: [] } });
    }
    const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
    const memberships = await siteService.listMemberships(req.businessModels, req.branchId, {
      featuredOnly,
      showPrices: showPrices(req),
    });
    res.json({ success: true, data: { memberships } });
  } catch (error) {
    logger.error('[public-site] memberships', error);
    res.status(500).json({ success: false, error: 'Could not load memberships.' });
  }
});

router.get('/memberships/:planSlug', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showMemberships !== true) {
      return res.status(404).json({ success: false, error: 'Membership not found.' });
    }
    const membership = await siteService.getMembershipBySlug(
      req.businessModels,
      req.branchId,
      req.params.planSlug,
      { showPrices: showPrices(req) }
    );
    if (!membership) return res.status(404).json({ success: false, error: 'Membership not found.' });
    res.json({ success: true, data: { membership } });
  } catch (error) {
    logger.error('[public-site] membership detail', error);
    res.status(500).json({ success: false, error: 'Could not load membership.' });
  }
});

router.get('/prepaid-wallets', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showPrepaidWallets !== true) {
      return res.json({ success: true, data: { prepaidWallets: [] } });
    }
    const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
    const prepaidWallets = await siteService.listPrepaidWallets(req.businessModels, req.branchId, {
      featuredOnly,
      showPrices: showPrices(req),
    });
    res.json({ success: true, data: { prepaidWallets } });
  } catch (error) {
    logger.error('[public-site] prepaid-wallets', error);
    res.status(500).json({ success: false, error: 'Could not load prepaid wallets.' });
  }
});

router.get('/team', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showStaff === false) {
      return res.json({ success: true, data: { staff: [] } });
    }
    const staff = await siteService.listTeam(req.businessModels, req.branchId);
    res.json({ success: true, data: { staff } });
  } catch (error) {
    logger.error('[public-site] team', error);
    res.status(500).json({ success: false, error: 'Could not load team.' });
  }
});

router.get('/gallery', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showGallery === false) {
      return res.json({ success: true, data: { items: [] } });
    }
    const items = await siteService.listGallery(req.businessModels, req.branchId, req.businessDoc);
    res.json({ success: true, data: { items } });
  } catch (error) {
    logger.error('[public-site] gallery', error);
    res.status(500).json({ success: false, error: 'Could not load gallery.' });
  }
});

router.get('/offers', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showOffers === false) {
      return res.json({ success: true, data: { offers: [] } });
    }
    const offers = await siteService.listOffers(req.businessModels, req.branchId);
    res.json({ success: true, data: { offers } });
  } catch (error) {
    logger.error('[public-site] offers', error);
    res.status(500).json({ success: false, error: 'Could not load offers.' });
  }
});

router.get('/reviews', readLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showReviews === false) {
      return res.json({ success: true, data: { reviews: [] } });
    }
    const reviews = await siteService.listReviews(req.businessModels, req.branchId);
    res.json({ success: true, data: { reviews } });
  } catch (error) {
    logger.error('[public-site] reviews', error);
    res.status(500).json({ success: false, error: 'Could not load reviews.' });
  }
});

const enquirySchema = z
  .object({
    type: z.enum(['bridal', 'package', 'membership', 'product', 'general']).default('general'),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(10).max(20),
    email: z.string().trim().email().max(320).optional().or(z.literal('')),
    city: z.string().trim().max(120).optional(),
    message: z.string().trim().max(2000).optional(),
    relatedServiceId: z.string().optional(),
    relatedPackageId: z.string().optional(),
    relatedProductId: z.string().optional(),
    relatedMembershipId: z.string().optional(),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    /** Honeypot — must be empty */
    website: z.string().max(0).optional().or(z.literal('')),
  })
  .strict();

router.post('/enquiry', writeLimiter, resolveTenant, async (req, res) => {
  try {
    const parsed = enquirySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues?.[0]?.message || 'Invalid enquiry.',
      });
    }
    const body = parsed.data;
    if (body.website) {
      return res.json({ success: true, data: { received: true } });
    }

    const { WebsiteEnquiry, Lead } = req.businessModels;
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '')
      .split(',')[0]
      .trim()
      .slice(0, 64);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);

    const configuredFields = req.businessDoc?.settings?.website?.enquiryForm?.customFields || [];
    let customFields = {};
    try {
      customFields = validateSubmittedCustomFields(configuredFields, body.customFields);
    } catch (fieldError) {
      return res.status(400).json({
        success: false,
        error: fieldError.message || 'Invalid custom field.',
      });
    }
    const customNotes = formatCustomFieldsForNotes(customFields, configuredFields);
    const leadNotes = [body.message || '', customNotes].filter(Boolean).join('\n');

    let leadId = null;
    if (Lead) {
      const lead = await Lead.create({
        name: body.name,
        phone: body.phone,
        email: body.email || '',
        source: 'website',
        status: 'new',
        notes: leadNotes,
        branchId: req.branchId,
        interestedServices: body.relatedServiceId
          ? [{ serviceId: body.relatedServiceId }]
          : [],
      });
      leadId = lead._id;
    }

    if (WebsiteEnquiry) {
      await WebsiteEnquiry.create({
        branchId: req.branchId,
        type: body.type,
        name: body.name,
        phone: body.phone,
        email: body.email || '',
        city: body.city || '',
        message: body.message || '',
        customFields,
        relatedServiceId: body.relatedServiceId || null,
        relatedPackageId: body.relatedPackageId || null,
        relatedProductId: body.relatedProductId || null,
        relatedMembershipId: body.relatedMembershipId || null,
        leadId,
        ip,
        userAgent,
      });
    }

    res.json({ success: true, data: { received: true } });
  } catch (error) {
    logger.error('[public-site] enquiry', error);
    res.status(500).json({ success: false, error: 'Could not submit enquiry.' });
  }
});

const productRequestSchema = z
  .object({
    fulfillmentType: z.enum(['delivery', 'pickup']),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(10).max(20),
    email: z.string().trim().max(320).optional().or(z.literal('')),
    deliveryAddress: z.string().trim().max(500).optional().or(z.literal('')),
    preferredPickupSlot: z.string().trim().max(200).optional().or(z.literal('')),
    message: z.string().trim().max(2000).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().trim().min(1).max(64),
          quantity: z.number().int().min(1).max(99).optional(),
        })
      )
      .min(1)
      .max(30),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    website: z.string().max(0).optional().or(z.literal('')),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.fulfillmentType === 'delivery') {
      const email = String(body.email || '').trim();
      if (!email || !z.string().email().safeParse(email).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Email is required for delivery.',
          path: ['email'],
        });
      }
      if (!String(body.deliveryAddress || '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Delivery address is required.',
          path: ['deliveryAddress'],
        });
      }
    }
  });

router.post('/product-request', writeLimiter, resolveTenant, async (req, res) => {
  try {
    if (visibility(req).showProducts === false) {
      return res.status(404).json({ success: false, error: 'Products are not available.' });
    }

    const parsed = productRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues?.[0]?.message || 'Invalid request.',
      });
    }
    const body = parsed.data;
    if (body.website) {
      return res.json({ success: true, data: { received: true } });
    }

    let requestedProducts;
    try {
      requestedProducts = await siteService.validatePublicProductRequestItems(
        req.businessModels,
        req.branchId,
        productVisibility(req),
        body.items
      );
    } catch (validationErr) {
      const code = validationErr.code || 'PRODUCT_UNAVAILABLE';
      return res.status(400).json({
        success: false,
        error: validationErr.message || 'One or more products are no longer available.',
        code,
      });
    }

    const { WebsiteEnquiry, Lead } = req.businessModels;
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '')
      .split(',')[0]
      .trim()
      .slice(0, 64);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);

    const configuredFields = req.businessDoc?.settings?.website?.enquiryForm?.customFields || [];
    let customFields = {};
    try {
      customFields = validateSubmittedCustomFields(configuredFields, body.customFields);
    } catch (fieldError) {
      return res.status(400).json({
        success: false,
        error: fieldError.message || 'Invalid custom field.',
      });
    }
    const customNotes = formatCustomFieldsForNotes(customFields, configuredFields);
    const productSummary = requestedProducts
      .map((p) => `${p.productName}${p.quantity > 1 ? ` × ${p.quantity}` : ''}`)
      .join(', ');
    const fulfillmentLabel = body.fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup';
    const leadNotes = [
      `Product purchase request (${fulfillmentLabel}): ${productSummary}`,
      body.fulfillmentType === 'delivery' && body.deliveryAddress
        ? `Delivery address: ${body.deliveryAddress}`
        : '',
      body.fulfillmentType === 'pickup' && body.preferredPickupSlot
        ? `Preferred pickup slot: ${body.preferredPickupSlot}`
        : '',
      body.message || '',
      customNotes,
    ]
      .filter(Boolean)
      .join('\n');

    let leadId = null;
    if (Lead) {
      const lead = await Lead.create({
        name: body.name,
        phone: body.phone,
        email: body.email || '',
        source: 'website',
        status: 'new',
        notes: leadNotes,
        branchId: req.branchId,
      });
      leadId = lead._id;
    }

    if (WebsiteEnquiry) {
      await WebsiteEnquiry.create({
        branchId: req.branchId,
        type: 'product_request',
        name: body.name,
        phone: body.phone,
        email: body.email || '',
        message: body.message || '',
        customFields,
        requestedProducts,
        fulfillmentType: body.fulfillmentType,
        deliveryAddress: body.fulfillmentType === 'delivery' ? body.deliveryAddress || '' : '',
        preferredPickupSlot:
          body.fulfillmentType === 'pickup' ? body.preferredPickupSlot || '' : '',
        leadId,
        ip,
        userAgent,
      });
    }

    void notifyWebsiteProductRequest({
      businessDoc: req.businessDoc,
      businessModels: req.businessModels,
      customerName: body.name,
      customerPhone: body.phone,
      customerEmail: body.email || '',
      fulfillmentType: body.fulfillmentType,
      deliveryAddress: body.deliveryAddress || '',
      preferredPickupSlot: body.preferredPickupSlot || '',
      items: requestedProducts,
      message: body.message || '',
    });

    res.json({ success: true, data: { received: true } });
  } catch (error) {
    logger.error('[public-site] product-request', error);
    res.status(500).json({ success: false, error: 'Could not submit product request.' });
  }
});

const trackSchema = z
  .object({
    event: z.enum(WEBSITE_ANALYTICS_EVENTS),
    path: z.string().max(500).optional(),
    refId: z.string().max(64).optional(),
    sessionId: z.string().max(64).optional(),
  })
  .strict();

function maskIp(ip) {
  const s = String(ip || '');
  if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (s.includes(':')) {
    const parts = s.split(':');
    return parts.slice(0, 4).join(':') + '::';
  }
  return '';
}

router.post('/track', trackLimiter, resolveTenant, async (req, res) => {
  try {
    const parsed = trackSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid event.' });
    }
    const main = req.mainConnection || (await databaseManager.getMainConnection());
    const WebsiteAnalyticsEvent = main.model(
      'WebsiteAnalyticsEvent',
      require('../models/WebsiteAnalyticsEvent').schema
    );
    const ip = maskIp(
      String(req.headers['x-forwarded-for'] || req.ip || '')
        .split(',')[0]
        .trim()
    );
    await WebsiteAnalyticsEvent.create({
      businessId: req.branchId,
      path: parsed.data.path || '',
      event: parsed.data.event,
      refId: parsed.data.refId || '',
      sessionId: parsed.data.sessionId || '',
      ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      referer: String(req.headers.referer || req.headers.referrer || '').slice(0, 500),
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('[public-site] track', error);
    res.status(204).end();
  }
});

module.exports = router;
