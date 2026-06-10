const express = require('express');
const { logger } = require('../utils/logger');
const { setupMainDatabase } = require('../middleware/business-db');
const planResolver = require('../lib/plan-resolver');
const { CANONICAL_PLAN_IDS } = require('../lib/plan-id');

const router = express.Router();

/**
 * GET /api/public/plans — pricing for canonical plans (starter/growth/pro).
 *
 * Sourced from the `PlanTemplate` collection that platform admins manage via
 * Settings → Plans, so the public /pricing page reflects whatever pricing the
 * admin last saved. Falls back to the static config when DB is unreachable.
 */
router.get('/', setupMainDatabase, async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;

    await planResolver.syncBuiltInPlanTemplates();

    const docs = await PlanTemplate.find({
      isActive: true,
      id: { $in: CANONICAL_PLAN_IDS },
    })
      .select('id name description monthlyPrice yearlyPrice')
      .sort({ createdAt: 1 })
      .lean();

    const plans = docs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      description: doc.description || '',
      monthlyPrice: doc.monthlyPrice,
      yearlyPrice: doc.yearlyPrice,
    }));

    res.json({
      success: true,
      data: { plans },
    });
  } catch (error) {
    logger.error('Error fetching public plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plans',
    });
  }
});

module.exports = router;
