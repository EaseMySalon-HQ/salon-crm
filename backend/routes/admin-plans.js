const express = require('express');
const { logger } = require('../utils/logger');
const router = express.Router();
const { setupMainDatabase } = require('../middleware/business-db');
const { getPlanConfig, getAllFeatures, getAllAddons } = require('../config/plans');
const { normalizePlanId, CANONICAL_PLAN_IDS, isCanonicalPlanId } = require('../lib/plan-id');
const { getPlanInfo, getEffectiveFeatures, hasFeature } = require('../lib/entitlements');
const planResolver = require('../lib/plan-resolver');
const entitlementsCache = require('../lib/entitlements-cache');
const {
  normalizeCategories,
  serializeMatrixDocument,
  DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES,
} = require('../lib/public-pricing-matrix-service');
const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');

function normalizeOptionalPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// GET /api/admin/plans/config - Get all plan configurations
router.get('/config', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'view'), async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;

    await planResolver.syncLegacyBusinessPlanIds();
    await planResolver.syncBuiltInPlanTemplates();

    // Admin UI lists only the three canonical plan templates.
    const dbPlans = await PlanTemplate.find({
      isActive: true,
      id: { $in: CANONICAL_PLAN_IDS },
    }).sort({ createdAt: 1 });
    const features = getAllFeatures();
    const addons = getAllAddons();

    const plans = dbPlans.map((dbPlan) => ({
      id: dbPlan.id,
      name: dbPlan.name,
      description: dbPlan.description,
      monthlyPrice: dbPlan.monthlyPrice,
      yearlyPrice: dbPlan.yearlyPrice,
      features: dbPlan.features,
      limits: dbPlan.limits,
      support: dbPlan.support,
      isDefault: dbPlan.isDefault,
      isActive: dbPlan.isActive,
    }));

    res.json({
      success: true,
      data: {
        plans,
        features,
        addons,
      },
    });
  } catch (error) {
    logger.error('Error fetching plan config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan configuration',
    });
  }
});

// GET /api/admin/plans/pricing-matrix — public pricing page feature matrix (admin)
router.get('/pricing-matrix', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'view'), async (req, res) => {
  try {
    const { PublicPricingMatrix } = req.mainModels;
    const doc = await PublicPricingMatrix.getMatrixDocument();
    res.json({
      success: true,
      data: serializeMatrixDocument(doc),
    });
  } catch (error) {
    logger.error('Error fetching admin pricing matrix:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing matrix',
    });
  }
});

// PUT /api/admin/plans/pricing-matrix — update public pricing page feature matrix
router.put('/pricing-matrix', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'update'), async (req, res) => {
  try {
    const { PublicPricingMatrix } = req.mainModels;
    const categories = normalizeCategories(req.body?.categories);

    let doc = await PublicPricingMatrix.findOne();
    if (!doc) {
      doc = new PublicPricingMatrix({ categories });
    } else {
      doc.categories = categories;
    }
    doc.updatedByAdminId = req.admin?._id || null;
    await doc.save();

    res.json({
      success: true,
      data: serializeMatrixDocument(doc),
      message: 'Pricing matrix updated successfully',
    });
  } catch (error) {
    logger.error('Error updating pricing matrix:', error);
    const message = error.message?.includes('requires') || error.message?.includes('must')
      ? error.message
      : 'Failed to update pricing matrix';
    res.status(error.message?.includes('requires') || error.message?.includes('must') ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
});

// POST /api/admin/plans/pricing-matrix/reset — restore default matrix
router.post('/pricing-matrix/reset', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'update'), async (req, res) => {
  try {
    const { PublicPricingMatrix } = req.mainModels;
    let doc = await PublicPricingMatrix.findOne();
    if (!doc) {
      doc = new PublicPricingMatrix({ categories: DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES });
    } else {
      doc.categories = DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES;
    }
    doc.updatedByAdminId = req.admin?._id || null;
    await doc.save();

    res.json({
      success: true,
      data: serializeMatrixDocument(doc),
      message: 'Pricing matrix reset to defaults',
    });
  } catch (error) {
    logger.error('Error resetting pricing matrix:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset pricing matrix',
    });
  }
});

// GET /api/admin/plans/templates - Get all plan templates
router.get('/templates', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'view'), async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;
    const templates = await PlanTemplate.find().sort({ createdAt: 1 });

    res.json({
      success: true,
      data: {
        templates,
      },
    });
  } catch (error) {
    logger.error('Error fetching plan templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan templates',
    });
  }
});

// POST /api/admin/plans/templates - Create new plan template
router.post('/templates', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'create'), async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;
    const {
      id,
      name,
      description,
      monthlyPrice,
      yearlyPrice,
      features,
      limits,
      support,
      isDefault,
    } = req.body;

    // Validate required fields
    if (!id || !name) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID and name are required',
      });
    }

    const canonicalId = normalizePlanId(id);
    if (!isCanonicalPlanId(canonicalId)) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID must be one of: starter, growth, pro',
      });
    }

    // Check if plan ID already exists
    const existing = await PlanTemplate.findOne({ id: canonicalId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Plan with this ID already exists',
      });
    }

    const template = new PlanTemplate({
      id: canonicalId,
      name,
      description: description || '',
      monthlyPrice: normalizeOptionalPrice(monthlyPrice),
      yearlyPrice: normalizeOptionalPrice(yearlyPrice),
      features: features || [],
      limits: limits || {
        locations: 1,
        staff: Infinity,
        whatsappMessages: 0,
        smsMessages: 0,
      },
      support: support || {
        email: true,
        phone: false,
        priority: false,
      },
      isDefault: isDefault || false,
      isActive: true,
      metadata: {
        createdBy: req.admin._id,
        updatedBy: req.admin._id,
      },
    });

    await template.save();

    // Plan definitions changed — refresh the resolver cache and drop any
    // per-business entitlement caches so tenants pick up the new plan.
    planResolver.invalidate();
    entitlementsCache.invalidateAll();

    res.json({
      success: true,
      message: 'Plan template created successfully',
      data: {
        template,
      },
    });
  } catch (error) {
    logger.error('Error creating plan template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create plan template',
    });
  }
});

// PUT /api/admin/plans/templates/:planId - Update plan template
router.put('/templates/:planId', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'update'), async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;
    const { planId } = req.params;
    const {
      name,
      description,
      monthlyPrice,
      yearlyPrice,
      features,
      limits,
      support,
      isDefault,
      isActive,
    } = req.body;

    const template = await PlanTemplate.findOne({ id: planId });
    let doc = template;
    if (!doc) {
      const configPlan = getPlanConfig(planId);
      if (!configPlan) {
        return res.status(404).json({
          success: false,
          error: 'Plan template not found',
        });
      }
      doc = new PlanTemplate({
        id: planId,
        name: configPlan.name,
        description: configPlan.description || '',
        monthlyPrice: configPlan.monthlyPrice,
        yearlyPrice: configPlan.yearlyPrice,
        features: configPlan.features || [],
        limits: configPlan.limits || {
          locations: 1,
          staff: Infinity,
          whatsappMessages: 0,
          smsMessages: 0,
        },
        support: configPlan.support || {
          email: true,
          phone: false,
          priority: false,
        },
        isActive: true,
        metadata: {
          createdBy: req.admin._id,
          updatedBy: req.admin._id,
        },
      });
    }

    // Update fields
    if (name !== undefined) doc.name = name;
    if (description !== undefined) doc.description = description;
    if (monthlyPrice !== undefined) doc.monthlyPrice = normalizeOptionalPrice(monthlyPrice);
    if (yearlyPrice !== undefined) doc.yearlyPrice = normalizeOptionalPrice(yearlyPrice);
    if (features !== undefined) doc.features = features;
    if (limits !== undefined) doc.limits = limits;
    if (support !== undefined) doc.support = support;
    if (isDefault !== undefined) doc.isDefault = isDefault;
    if (isActive !== undefined) doc.isActive = isActive;

    doc.metadata = doc.metadata || {};
    doc.metadata.updatedBy = req.admin._id;

    await doc.save();

    // Feature toggles / limits changed — refresh resolver + per-business caches
    // so the change takes effect immediately for all tenants on this plan.
    planResolver.invalidate();
    entitlementsCache.invalidateAll();

    res.json({
      success: true,
      message: 'Plan template updated successfully',
      data: {
        template: doc,
      },
    });
  } catch (error) {
    logger.error('Error updating plan template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update plan template',
    });
  }
});

// DELETE /api/admin/plans/templates/:planId - Delete plan template
router.delete('/templates/:planId', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'delete'), async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;
    const { planId } = req.params;

    if (isCanonicalPlanId(planId)) {
      return res.status(400).json({
        success: false,
        error: 'Starter, Growth, and Pro templates cannot be deleted',
      });
    }

    const template = await PlanTemplate.findOne({ id: planId });
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Plan template not found',
      });
    }

    // Check if any businesses are using this plan
    const { Business } = req.mainModels;
    const businessesUsingPlan = await Business.countDocuments({ 'plan.planId': planId });
    
    if (businessesUsingPlan > 0) {
      // Instead of deleting, deactivate
      template.isActive = false;
      await template.save();

      planResolver.invalidate();
      entitlementsCache.invalidateAll();

      return res.json({
        success: true,
        message: 'Plan template deactivated (businesses are using this plan)',
        data: {
          template,
        },
      });
    }

    await PlanTemplate.deleteOne({ id: planId });

    planResolver.invalidate();
    entitlementsCache.invalidateAll();

    res.json({
      success: true,
      message: 'Plan template deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting plan template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete plan template',
    });
  }
});

// GET /api/admin/plans/businesses - Get all businesses with their plan info
router.get('/businesses', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'view'), async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const { search, planId, status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { 'contact.email': { $regex: search, $options: 'i' } },
      ];
    }

    if (planId) {
      query['plan.planId'] = planId;
    }

    if (status) {
      query.status = status;
    } else {
      query.status = { $ne: 'deleted' }; // Exclude deleted by default
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const businesses = await Business.find(query)
      .select('name code contact plan status createdAt')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Business.countDocuments(query);

    // Enrich with plan info
    const enrichedBusinesses = businesses.map((business) => {
      const planInfo = getPlanInfo(business);
      return {
        _id: business._id,
        name: business.name,
        code: business.code,
        contact: business.contact,
        status: business.status,
        plan: planInfo,
        createdAt: business.createdAt,
        owner: business.owner,
      };
    });

    res.json({
      success: true,
      data: {
        businesses: enrichedBusinesses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching businesses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch businesses',
    });
  }
});

// GET /api/admin/plans/business/:businessId - Get specific business plan details
router.get('/business/:businessId', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'view'), async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const { businessId } = req.params;

    const business = await Business.findById(businessId)
      .select('name code contact plan status createdAt')
      .populate('owner', 'name email');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found',
      });
    }

    const planInfo = getPlanInfo(business);
    const effectiveFeatures = getEffectiveFeatures(business);
    const allFeatures = getAllFeatures();

    // Map features with enabled status
    const featuresWithStatus = allFeatures.map((feature) => ({
      ...feature,
      enabled: effectiveFeatures.includes(feature.id),
    }));

    res.json({
      success: true,
      data: {
        business: {
          _id: business._id,
          name: business.name,
          code: business.code,
          contact: business.contact,
          status: business.status,
          plan: planInfo,
          features: featuresWithStatus,
          overrides: business.plan.overrides || {
            features: [],
            disabledFeatures: [],
            expiresAt: null,
            notes: '',
          },
          createdAt: business.createdAt,
          owner: business.owner,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching business plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch business plan details',
    });
  }
});

// PUT /api/admin/plans/business/:businessId - Update business plan
router.put('/business/:businessId', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'assign'), async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const { PlanChangeLog } = req.mainModels;
    const { businessId } = req.params;
    const {
      planId,
      billingPeriod,
      renewalDate,
      isTrial,
      trialEndsAt,
      overrides,
      addons,
    } = req.body;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found',
      });
    }

    const previousPlan = {
      planId: business.plan?.planId,
      billingPeriod: business.plan?.billingPeriod,
      isTrial: business.plan?.isTrial,
      trialEndsAt: business.plan?.trialEndsAt,
      overrides: business.plan?.overrides,
      addons: business.plan?.addons,
    };

    if (!business.plan) {
      business.plan = {};
    }

    if (planId !== undefined) {
      const canonicalPlanId = normalizePlanId(planId);
      if (!getPlanConfig(canonicalPlanId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid plan ID',
        });
      }
      business.plan.planId = canonicalPlanId;
      // Sync addon quota/enabled from plan limits when plan changes
      const planConfig = getPlanConfig(canonicalPlanId);
      if (planConfig && planConfig.limits) {
        if (!business.plan.addons) business.plan.addons = {};
        const smsLimit = planConfig.limits.smsMessages ?? 0;
        if (!business.plan.addons.sms) business.plan.addons.sms = {};
        business.plan.addons.sms.quota = smsLimit;
        business.plan.addons.sms.enabled = smsLimit > 0;
        const whatsappLimit = planConfig.limits.whatsappMessages ?? 0;
        if (!business.plan.addons.whatsapp) business.plan.addons.whatsapp = {};
        business.plan.addons.whatsapp.quota = whatsappLimit;
        business.plan.addons.whatsapp.enabled = whatsappLimit > 0;
      }
    }
    if (billingPeriod !== undefined) {
      business.plan.billingPeriod = billingPeriod;
    }
    if (renewalDate !== undefined) {
      business.plan.renewalDate = renewalDate ? new Date(renewalDate) : null;
    }
    if (isTrial !== undefined) {
      business.plan.isTrial = isTrial;
    }
    if (trialEndsAt !== undefined) {
      business.plan.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
    }
    if (overrides !== undefined) {
      business.plan.overrides = {
        features: overrides.features || [],
        disabledFeatures: overrides.disabledFeatures || [],
        expiresAt: overrides.expiresAt ? new Date(overrides.expiresAt) : null,
        notes: overrides.notes || '',
      };
    }
    if (addons !== undefined) {
      if (!business.plan.addons) {
        business.plan.addons = {};
      }
      Object.keys(addons).forEach((addonId) => {
        if (!business.plan.addons[addonId]) {
          business.plan.addons[addonId] = {};
        }
        if (addons[addonId].enabled !== undefined) {
          business.plan.addons[addonId].enabled = addons[addonId].enabled;
        }
        if (addons[addonId].quota !== undefined) {
          business.plan.addons[addonId].quota = addons[addonId].quota;
        }
      });
    }

    await business.save();

    // The business's plan/overrides/addons changed — drop its cached
    // entitlements so the next request re-resolves them.
    entitlementsCache.invalidate(business._id);

    // Log the change
    const changeLog = new PlanChangeLog({
      businessId: business._id,
      changedBy: req.admin._id,
      changeType: planId !== previousPlan.planId ? 'plan_change' : 'feature_override',
      previousValue: previousPlan,
      newValue: {
        planId: business.plan.planId,
        billingPeriod: business.plan.billingPeriod,
        isTrial: business.plan.isTrial,
        trialEndsAt: business.plan.trialEndsAt,
        overrides: business.plan.overrides,
        addons: business.plan.addons,
      },
      reason: req.body.reason || 'Plan updated by admin',
      metadata: {
        adminEmail: req.admin.email,
        adminName: req.admin.name || `${req.admin.firstName || ''} ${req.admin.lastName || ''}`.trim(),
      },
    });

    await changeLog.save();

    // Get updated plan info
    const planInfo = getPlanInfo(business);

    res.json({
      success: true,
      message: 'Business plan updated successfully',
      data: {
        business: {
          _id: business._id,
          name: business.name,
          code: business.code,
          plan: planInfo,
        },
      },
    });
  } catch (error) {
    logger.error('Error updating business plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update business plan',
    });
  }
});

// GET /api/admin/plans/business/:businessId/history - Get plan change history
router.get('/business/:businessId/history', authenticateAdmin, setupMainDatabase, checkAdminPermission('plans', 'view'), async (req, res) => {
  try {
    const { PlanChangeLog } = req.mainModels;
    const { businessId } = req.params;
    const { limit = 50 } = req.query;

    const history = await PlanChangeLog.find({ businessId })
      .populate('changedBy', 'email name firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        history,
      },
    });
  } catch (error) {
    logger.error('Error fetching plan history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan change history',
    });
  }
});

module.exports = router;

