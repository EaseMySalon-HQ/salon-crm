/**
 * Plan Resolver
 *
 * Single source of truth for "what does plan <id> contain" at runtime.
 *
 * Admins edit plans in the `PlanTemplate` collection (see
 * backend/routes/admin-plans.js). The static `PLANS` config in
 * backend/config/plans.js is only a built-in fallback / seed. The entitlement
 * engine MUST read the admin-editable templates so that toggling a feature in
 * the admin UI actually changes what a tenant can access.
 *
 * To keep the entitlement helpers synchronous and fast (they run on every
 * gated request) this module keeps an in-memory cache of all active plan
 * templates, refreshed:
 *   - eagerly at startup via warmup()
 *   - lazily (fire-and-forget) when the cache goes stale past TTL
 *   - immediately when an admin write calls invalidate()
 */

const { getPlanConfig, getAllPlans } = require('../config/plans');
const { normalizePlanId, LEGACY_PLAN_IDS, LEGACY_PLAN_ID_ALIASES } = require('./plan-id');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

// id -> resolved plan config object
const templateCache = new Map();
let lastLoadedAt = 0;
let loadingPromise = null;

// Plan templates change rarely; a short TTL keeps tenants fresh without
// hammering the main DB. Admin writes invalidate explicitly so the TTL is
// only a safety net.
const TTL_MS = 60 * 1000;

function isStale() {
  return Date.now() - lastLoadedAt > TTL_MS;
}

/**
 * Merge a DB PlanTemplate document over the static config for the same id.
 * DB values win when present; static config fills any gaps.
 */
function mergeTemplate(dbPlan) {
  const staticConfig = getPlanConfig(dbPlan.id) || {};
  return {
    id: dbPlan.id,
    name: dbPlan.name != null ? dbPlan.name : staticConfig.name,
    description: dbPlan.description != null ? dbPlan.description : staticConfig.description,
    monthlyPrice: dbPlan.monthlyPrice !== undefined ? dbPlan.monthlyPrice : staticConfig.monthlyPrice,
    yearlyPrice: dbPlan.yearlyPrice !== undefined ? dbPlan.yearlyPrice : staticConfig.yearlyPrice,
    features: Array.isArray(dbPlan.features) ? [...dbPlan.features] : (staticConfig.features || []),
    limits: dbPlan.limits ? { ...(staticConfig.limits || {}), ...dbPlan.limits } : (staticConfig.limits || {}),
    support: dbPlan.support ? { ...(staticConfig.support || {}), ...dbPlan.support } : (staticConfig.support || {}),
    isActive: dbPlan.isActive,
    isDefault: dbPlan.isDefault,
    source: 'db',
  };
}

/**
 * Load all active plan templates from the main DB into the cache.
 * Safe to call concurrently — collapses to a single in-flight load.
 */
async function refreshPlanTemplates() {
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const mainConnection = await databaseManager.getMainConnection();
      const { PlanTemplate } = modelFactory.createMainModels(mainConnection);
      const dbPlans = await PlanTemplate.find({ isActive: true }).lean();

      const next = new Map();
      dbPlans.forEach((dbPlan) => {
        if (dbPlan && dbPlan.id) {
          const canonicalId = normalizePlanId(dbPlan.id);
          next.set(canonicalId, mergeTemplate({ ...dbPlan, id: canonicalId }));
        }
      });

      templateCache.clear();
      next.forEach((value, key) => templateCache.set(key, value));
      lastLoadedAt = Date.now();
      logger.debug(`📦 plan-resolver: loaded ${templateCache.size} active plan template(s)`);
    } catch (error) {
      // Never throw — entitlement resolution must degrade gracefully to the
      // static config rather than failing the whole request.
      logger.warn('plan-resolver: failed to refresh plan templates, using static config fallback:', error.message);
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * Resolve the effective plan config for a planId, synchronously.
 *
 * Order of precedence:
 *   1. Cached DB template (admin-editable)
 *   2. Static config fallback (built-in seed)
 *
 * When the cache is stale a background refresh is kicked off, but the current
 * cached/fallback value is returned immediately so callers stay sync.
 */
function resolvePlanConfig(planId) {
  if (!planId) return null;
  const canonicalId = normalizePlanId(planId);

  if (isStale()) {
    // Fire-and-forget; do not block the request.
    void refreshPlanTemplates();
  }

  if (templateCache.has(canonicalId)) {
    return templateCache.get(canonicalId);
  }

  return getPlanConfig(canonicalId);
}

/**
 * Return all resolvable plans (DB templates merged over static config).
 */
function resolveAllPlans() {
  if (isStale()) {
    void refreshPlanTemplates();
  }
  const map = new Map();
  getAllPlans().forEach((plan) => map.set(plan.id, plan));
  templateCache.forEach((plan, id) => map.set(id, plan));
  return Array.from(map.values());
}

/**
 * Invalidate the cache after an admin write. Triggers an immediate reload so
 * the next entitlement check reflects the change.
 */
function invalidate() {
  lastLoadedAt = 0;
  templateCache.clear();
  void refreshPlanTemplates();
}

/**
 * Ensure the three canonical plan templates exist in the DB and retire legacy ids.
 * Migrates the old `free` (Starter) template to `starter` so admin UI always shows
 * all three tiers after the plan id rename.
 */
async function ensureStarterTemplate(PlanTemplate) {
  const builtInStarter = getPlanConfig('starter');
  if (!builtInStarter) return;

  const freeDoc = await PlanTemplate.findOne({ id: 'free' });
  const starterDoc = await PlanTemplate.findOne({ id: 'starter' });

  const starterPayload = (source) => ({
    name: source?.name && source.name !== 'Free' ? source.name : builtInStarter.name,
    description: source?.description ?? builtInStarter.description,
    monthlyPrice: source?.monthlyPrice ?? builtInStarter.monthlyPrice,
    yearlyPrice: source?.yearlyPrice ?? builtInStarter.yearlyPrice,
    features:
      Array.isArray(source?.features) && source.features.length > 0
        ? source.features
        : builtInStarter.features,
    limits: source?.limits || builtInStarter.limits,
    support: source?.support || builtInStarter.support,
    isActive: true,
    isDefault: true,
  });

  if (freeDoc) {
    const payload = starterPayload(freeDoc);
    if (starterDoc) {
      await PlanTemplate.updateOne({ id: 'starter' }, { $set: payload });
      logger.info('plan-resolver: copied "free" template data onto "starter"');
    } else {
      await PlanTemplate.updateOne(
        { _id: freeDoc._id },
        { $set: { ...payload, id: 'starter' } },
      );
      logger.info('plan-resolver: migrated plan template "free" → "starter"');
    }
    await PlanTemplate.updateOne({ id: 'free' }, { $set: { isActive: false, isDefault: false } });
    return;
  }

  if (starterDoc && !starterDoc.isActive) {
    await PlanTemplate.updateOne({ id: 'starter' }, { $set: starterPayload(starterDoc) });
    logger.info('plan-resolver: reactivated plan template "starter"');
  }
}

async function syncLegacyBusinessPlanIds() {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const { Business, PlanInvoiceTransaction } = modelFactory.createMainModels(mainConnection);

    for (const [from, to] of Object.entries(LEGACY_PLAN_ID_ALIASES)) {
      const planResult = await Business.updateMany(
        { 'plan.planId': from },
        { $set: { 'plan.planId': to } },
      );
      const pendingResult = await Business.updateMany(
        { 'plan.pendingPlanId': from },
        { $set: { 'plan.pendingPlanId': to } },
      );
      const invoiceResult = await PlanInvoiceTransaction.updateMany(
        { planId: from },
        { $set: { planId: to } },
      );
      const total =
        planResult.modifiedCount + pendingResult.modifiedCount + invoiceResult.modifiedCount;
      if (total > 0) {
        logger.info(
          `plan-resolver: migrated legacy plan id "${from}" → "${to}" (${planResult.modifiedCount} businesses, ${pendingResult.modifiedCount} pending, ${invoiceResult.modifiedCount} invoices)`,
        );
      }
    }
  } catch (error) {
    logger.warn('plan-resolver: syncLegacyBusinessPlanIds failed:', error.message);
  }
}

async function syncBuiltInPlanTemplates() {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const { PlanTemplate } = modelFactory.createMainModels(mainConnection);
    const builtIn = getAllPlans();
    let featuresMerged = false;

    await ensureStarterTemplate(PlanTemplate);

    for (const plan of builtIn) {
      const existing = await PlanTemplate.findOne({ id: plan.id });
      if (existing) {
        if (!existing.isActive) {
          await PlanTemplate.updateOne(
            { id: plan.id },
            {
              $set: {
                isActive: true,
                isDefault: plan.id === 'starter',
              },
            },
          );
          logger.info(`plan-resolver: reactivated plan template "${plan.id}"`);
        }
        const staticFeatures = Array.isArray(plan.features) ? plan.features : [];
        const existingFeatures = Array.isArray(existing.features) ? existing.features : [];
        const missingFeatures = staticFeatures.filter((f) => !existingFeatures.includes(f));
        if (missingFeatures.length > 0) {
          await PlanTemplate.updateOne(
            { id: plan.id },
            { $addToSet: { features: { $each: missingFeatures } } },
          );
          featuresMerged = true;
          logger.info(
            `plan-resolver: added ${missingFeatures.length} feature(s) to "${plan.id}": ${missingFeatures.join(', ')}`,
          );
        }
        continue;
      }
      await PlanTemplate.create({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        features: plan.features,
        limits: plan.limits,
        support: plan.support,
        isActive: true,
        isDefault: plan.id === 'starter',
      });
      logger.info(`plan-resolver: seeded plan template "${plan.id}" (${plan.name})`);
    }

    const deactivated = await PlanTemplate.updateMany(
      { id: { $in: LEGACY_PLAN_IDS } },
      { $set: { isActive: false, isDefault: false } },
    );
    if (deactivated.modifiedCount > 0) {
      logger.info(`plan-resolver: deactivated ${deactivated.modifiedCount} legacy plan template(s)`);
    }

    if (featuresMerged) {
      try {
        require('./entitlements-cache').invalidateAll();
      } catch {
        /* non-fatal */
      }
    }
  } catch (error) {
    logger.warn('plan-resolver: syncBuiltInPlanTemplates failed:', error.message);
  }
}

/**
 * Eagerly load templates at startup so the very first requests use DB values.
 */
async function warmup() {
  await syncLegacyBusinessPlanIds();
  await syncBuiltInPlanTemplates();
  await refreshPlanTemplates();
}

module.exports = {
  resolvePlanConfig,
  resolveAllPlans,
  refreshPlanTemplates,
  syncLegacyBusinessPlanIds,
  syncBuiltInPlanTemplates,
  invalidate,
  warmup,
};
