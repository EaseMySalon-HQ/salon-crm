'use strict';

const mongoose = require('mongoose');

function isCompletedSale(sale) {
  const s = (sale && sale.status ? String(sale.status) : '').toLowerCase();
  return s === 'completed';
}

function sanitizeReviewText(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
  t = t.trim().slice(0, 2000);
  return t;
}

/** Normalizes body/query source to Feedback.source enum. */
function normalizeFeedbackSource(v) {
  const raw = v != null ? String(v).trim().toLowerCase() : '';
  if (raw === 'whatsapp' || raw === 'wa') return 'whatsapp';
  if (raw === 'sms') return 'sms';
  if (raw === 'invoice' || raw === 'invoice_page' || raw === 'receipt') return 'invoice_page';
  if (raw === 'public_link' || raw === 'link' || raw === 'public') return 'public_link';
  return 'public_link';
}

function parseGoogleReviewUrl(settingsLean) {
  const googleReviewUrlRaw = (settingsLean?.googleReviewUrl || '').trim();
  if (!googleReviewUrlRaw) return '';
  try {
    const u = new URL(googleReviewUrlRaw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return googleReviewUrlRaw;
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * @param {object} businessModels - tenant models
 * @param {object} saleLeanOrDoc - sale with _id
 * @param {{ forInvoicePage?: boolean }} [options] - invoice/receipt public page: one submission only (ignore tenant resubmit toggle)
 */
async function getFeedbackEligibilityForSale(businessModels, saleLeanOrDoc, options = {}) {
  const { Feedback, BusinessSettings } = businessModels;
  const completed = isCompletedSale(saleLeanOrDoc);
  if (!completed) {
    return {
      completed: false,
      canSubmit: false,
      alreadySubmitted: false,
      allowResubmission: false,
      submittedRating: null,
    };
  }
  const settings = await BusinessSettings.findOne().lean();
  const tenantAllows = settings?.allowFeedbackResubmission === true;
  const allowResubmission = options.forInvoicePage ? false : tenantAllows;
  const existing = await Feedback.findOne({ saleId: saleLeanOrDoc._id }).lean();
  const alreadySubmitted = !!existing;
  const canSubmit = !alreadySubmitted || allowResubmission;
  return {
    completed: true,
    canSubmit,
    alreadySubmitted,
    allowResubmission,
    submittedRating: existing && !allowResubmission ? existing.rating : null,
  };
}

/**
 * @param {object} params
 * @param {object} params.businessModels
 * @param {import('mongoose').Types.ObjectId|string} params.tenantBusinessId
 * @param {import('mongoose').Document} params.sale - Sale mongoose document
 * @param {number} params.rating
 * @param {string} params.reviewText - pre-sanitized
 * @param {string} params.source - whatsapp|sms|public_link|invoice_page
 * @returns {Promise<{ success: true, data: object } | { success: false, status: number, error: string }>}
 */
async function executePublicFeedbackSubmit({
  businessModels,
  tenantBusinessId,
  sale,
  rating,
  reviewText,
  source,
}) {
  const { Feedback, BusinessSettings } = businessModels;

  if (!sale || !sale._id) {
    return { success: false, status: 404, error: 'Sale not found' };
  }

  if (!isCompletedSale(sale)) {
    return {
      success: false,
      status: 400,
      error: 'Feedback is only available for completed visits.',
    };
  }

  const settings = await BusinessSettings.findOne().lean();
  const tenantAllows = settings?.allowFeedbackResubmission === true;
  /** Invoice/receipt link: always one rating per sale (standalone /feedback/:id/:token still respects tenant setting). */
  const allowResubmission = source === 'invoice_page' ? false : tenantAllows;
  const googleReviewUrl = parseGoogleReviewUrl(settings);

  const branchId = sale.branchId || new mongoose.Types.ObjectId(tenantBusinessId);
  const businessOid = new mongoose.Types.ObjectId(tenantBusinessId);

  const existing = await Feedback.findOne({ saleId: sale._id });
  if (existing && !allowResubmission) {
    return {
      success: false,
      status: 409,
      error: 'Feedback has already been submitted for this visit.',
    };
  }

  const googlePromptShown = rating === 5 && !!googleReviewUrl;

  if (existing && allowResubmission) {
    existing.rating = rating;
    existing.reviewText = reviewText;
    existing.source = source;
    existing.googlePromptShown = googlePromptShown;
    existing.submittedAt = new Date();
    existing.status = 'new';
    await existing.save();

    if (rating === 5) {
      return {
        success: true,
        data: {
          thankYouType: 'google',
          googleReviewUrl: googleReviewUrl || null,
          copyHint: reviewText.length > 0,
          googleConfigured: !!googleReviewUrl,
        },
      };
    }
    return {
      success: true,
      data: { thankYouType: 'internal' },
    };
  }

  try {
    const doc = await Feedback.create({
      businessId: businessOid,
      branchId,
      customerId: sale.customerId || null,
      saleId: sale._id,
      customerName: sale.customerName || '',
      customerPhone: sale.customerPhone || '',
      rating,
      reviewText,
      source,
      googlePromptShown,
      status: 'new',
      submittedAt: new Date(),
    });

    if (rating === 5) {
      return {
        success: true,
        data: {
          thankYouType: 'google',
          googleReviewUrl: googleReviewUrl || null,
          copyHint: reviewText.length > 0,
          googleConfigured: !!googleReviewUrl,
          id: doc._id,
        },
      };
    }

    return {
      success: true,
      data: { thankYouType: 'internal', id: doc._id },
    };
  } catch (err) {
    if (err && err.code === 11000) {
      return {
        success: false,
        status: 409,
        error: 'Feedback has already been submitted for this visit.',
      };
    }
    throw err;
  }
}

module.exports = {
  isCompletedSale,
  sanitizeReviewText,
  normalizeFeedbackSource,
  parseGoogleReviewUrl,
  getFeedbackEligibilityForSale,
  executePublicFeedbackSubmit,
};
