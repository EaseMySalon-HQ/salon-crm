'use strict';

const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const {
  isCompletedSale,
  sanitizeReviewText,
  normalizeFeedbackSource,
  getFeedbackEligibilityForSale,
  executePublicFeedbackSubmit,
} = require('../lib/execute-public-feedback-submit');

const router = express.Router();

const publicFeedbackSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions. Please try again later.' },
});

async function getBusinessModelsForTenant(businessId) {
  if (!mongoose.Types.ObjectId.isValid(businessId)) {
    return null;
  }
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const business = await Business.findById(businessId).lean();
  if (!business || business.status !== 'active') {
    return null;
  }
  const businessDb = await databaseManager.getConnection(businessId, mainConnection);
  return { businessModels: modelFactory.createBusinessModels(businessDb), business };
}

/** GET public context — no secrets */
router.get('/:businessId/:token', async (req, res) => {
  try {
    const { businessId, token } = req.params;
    if (!token || token.length < 16) {
      return res.status(400).json({ success: false, error: 'Invalid feedback link' });
    }

    const ctx = await getBusinessModelsForTenant(businessId);
    if (!ctx) {
      return res.status(404).json({ success: false, error: 'Feedback link not found' });
    }

    const { Sale, BusinessSettings } = ctx.businessModels;
    const sale = await Sale.findOne({ feedbackToken: token }).lean();
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Feedback link not found' });
    }

    if (!isCompletedSale(sale)) {
      return res.status(400).json({
        success: false,
        error: 'Feedback is only available for completed visits.',
      });
    }

    const settings = await BusinessSettings.findOne().lean();
    const businessName = settings?.name || ctx.business.name || 'Salon';

    const items = Array.isArray(sale.items)
      ? sale.items.slice(0, 15).map((it) => ({
          name: String(it.name || '').slice(0, 200),
          type: it.type || 'service',
        }))
      : [];

    const eligibility = await getFeedbackEligibilityForSale(ctx.businessModels, sale);

    return res.json({
      success: true,
      data: {
        businessName,
        billNo: sale.billNo,
        visitDate: sale.date,
        items,
        alreadySubmitted: eligibility.alreadySubmitted && !eligibility.allowResubmission,
        allowResubmission: eligibility.allowResubmission,
        submittedRating: eligibility.submittedRating,
      },
    });
  } catch (err) {
    logger.error('public feedback GET:', err);
    return res.status(500).json({ success: false, error: 'Something went wrong' });
  }
});

router.post('/:businessId/:token/submit', publicFeedbackSubmitLimiter, async (req, res) => {
  try {
    const { businessId, token } = req.params;
    if (!token || token.length < 16) {
      return res.status(400).json({ success: false, error: 'Invalid feedback link' });
    }

    const ctx = await getBusinessModelsForTenant(businessId);
    if (!ctx) {
      return res.status(404).json({ success: false, error: 'Feedback link not found' });
    }

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
    }

    const reviewText = sanitizeReviewText(req.body?.reviewText);
    const source = normalizeFeedbackSource(req.body?.source ?? req.query?.s);

    const { Sale } = ctx.businessModels;
    const sale = await Sale.findOne({ feedbackToken: token });
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Feedback link not found' });
    }

    const result = await executePublicFeedbackSubmit({
      businessModels: ctx.businessModels,
      tenantBusinessId: businessId,
      sale,
      rating,
      reviewText,
      source,
    });

    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    logger.error('public feedback submit:', err);
    return res.status(500).json({ success: false, error: 'Something went wrong' });
  }
});

module.exports = router;
