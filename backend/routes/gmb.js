/**
 * Google Business Profile integration routes.
 * Mounted at /api/gmb
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupMainDatabase, setupBusinessDatabase } = require('../middleware/business-db');
const { gate, FEATURE } = require('../config/feature-routes');
const requireGmbAddon = require('../middleware/gmb-addon');
const gmbService = require('../services/google-business-service');
const { encrypt } = require('../lib/crypto');
const { verifyState } = require('../lib/gmb-oauth-state');
const { generateReply } = require('../lib/gmb-reply-ai');
const { computeComponentsForBranch } = require('../lib/gmb-health-score');
const {
  getMainModels,
  resolveBusinessContext,
  publicAccountView,
  logSync,
} = require('../lib/gmb-helpers');
const { logger } = require('../utils/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

router.get('/connect', authenticateToken, requireManager, setupMainDatabase, gate(FEATURE.GMB_CONNECT), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const url = await gmbService.generateAuthUrl({
      businessId: ctx.businessObjectId,
      branchId: ctx.branchId,
      userId: req.user.id || req.user._id,
    });
    return res.json({ success: true, data: { authUrl: url } });
  } catch (err) {
    logger.error('[gmb] /connect failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to start OAuth' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${FRONTEND_URL}/settings?section=google-business&error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/settings?section=google-business&error=missing_code`);
    }

    const verified = verifyState(state);
    if (!verified.ok) {
      return res.redirect(`${FRONTEND_URL}/settings?section=google-business&error=invalid_state`);
    }

    const { businessId, branchId } = verified.payload;
    const tokens = await gmbService.exchangeCode(code);
    const { GmbAccount } = await getMainModels();

    let account = await GmbAccount.findOne({
      businessId,
      branchId: branchId || null,
    });

    if (!account) {
      account = new GmbAccount({
        businessId,
        branchId: branchId || null,
      });
    }

    account.accessTokenCipher = encrypt(tokens.access_token);
    account.refreshTokenCipher = encrypt(tokens.refresh_token);
    account.expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600_000);
    account.status = 'pending_location';
    account.connectedAt = new Date();
    account.disconnectedAt = null;
    account.draftModeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    try {
      const accounts = await gmbService.listAccounts(account);
      if (accounts.length > 0) {
        account.accountId = accounts[0].name;
        account.accountName = accounts[0].accountName || accounts[0].name;
        account.locationCount = 0;
        const locations = await gmbService.listLocations(account, accounts[0].name);
        account.locationCount = locations.length;
        if (locations.length === 1) {
          account.locationId = locations[0].name;
          account.locationName = locations[0].title;
          account.status = 'connected';
        }
      }
    } catch (listErr) {
      logger.warn('[gmb] post-oauth list failed:', listErr?.message || listErr);
      account.lastErrorMessage = listErr?.message || 'Failed to list accounts';
    }

    await account.save();
    return res.redirect(`${FRONTEND_URL}/settings?section=google-business&connected=1`);
  } catch (err) {
    logger.error('[gmb] /callback failed:', err);
    return res.redirect(
      `${FRONTEND_URL}/settings?section=google-business&error=${encodeURIComponent(err.message || 'oauth_failed')}`
    );
  }
});

router.delete('/disconnect', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account) return res.json({ success: true, data: { disconnected: true } });

    await gmbService.revokeToken(ctx.account.refreshTokenCipher);
    await ctx.GmbAccount.deleteOne({ _id: ctx.account._id });
    await logSync(ctx.businessModels, {
      operation: 'oauth_disconnect',
      status: 'success',
      message: 'Disconnected Google Business Profile',
    });
    return res.json({ success: true, data: { disconnected: true } });
  } catch (err) {
    logger.error('[gmb] /disconnect failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to disconnect' });
  }
});

router.get('/status', authenticateToken, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    let locations = [];
    if (ctx.account?.status === 'connected' || ctx.account?.status === 'pending_location') {
      try {
        if (ctx.account.accountId) {
          locations = await gmbService.listLocations(ctx.account, ctx.account.accountId);
        }
      } catch {
        /* ignore */
      }
    }

    const biz = await ctx.Business.findById(ctx.businessObjectId).select('plan.addons.googleBusiness').lean();
    return res.json({
      success: true,
      data: {
        ...publicAccountView(ctx.account, locations),
        addonEnabled: Boolean(biz?.plan?.addons?.googleBusiness?.enabled),
      },
    });
  } catch (err) {
    logger.error('[gmb] /status failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load status' });
  }
});

router.get('/accounts', authenticateToken, setupMainDatabase, gate(FEATURE.GMB_CONNECT), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.accessTokenCipher) {
      return res.status(400).json({ success: false, error: 'Not connected' });
    }

    const accounts = await gmbService.listAccounts(ctx.account);
    const withLocations = [];
    for (const acct of accounts) {
      const locations = await gmbService.listLocations(ctx.account, acct.name);
      withLocations.push({
        accountId: acct.name,
        accountName: acct.accountName || acct.name,
        locations: locations.map((l) => ({
          locationId: l.name,
          locationName: l.title,
          address: l.storefrontAddress,
        })),
      });
    }
    return res.json({ success: true, data: { accounts: withLocations } });
  } catch (err) {
    logger.error('[gmb] /accounts failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to list accounts' });
  }
});

router.put('/location', authenticateToken, requireManager, setupMainDatabase, gate(FEATURE.GMB_CONNECT), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account) return res.status(400).json({ success: false, error: 'Not connected' });

    const { accountId, locationId, locationName } = req.body || {};
    if (!accountId || !locationId) {
      return res.status(400).json({ success: false, error: 'accountId and locationId are required' });
    }

    ctx.account.accountId = accountId;
    ctx.account.locationId = locationId;
    ctx.account.locationName = locationName || null;
    ctx.account.status = 'connected';
    await ctx.account.save();

    return res.json({ success: true, data: publicAccountView(ctx.account) });
  } catch (err) {
    logger.error('[gmb] /location failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to map location' });
  }
});

router.get('/reviews', authenticateToken, setupBusinessDatabase, gate(FEATURE.GMB_REVIEWS_READ), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { GmbReview } = ctx.businessModels;
    const filter = {};
    const { replied, rating, page = 1, limit = 20 } = req.query;

    if (replied === 'true') filter.replyText = { $ne: null };
    if (replied === 'false') filter.replyText = null;
    if (rating) filter.starRating = Number(rating);

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(50, Number(limit));
    const lim = Math.min(50, Number(limit));

    const [reviews, total] = await Promise.all([
      GmbReview.find(filter).sort({ createTime: -1 }).skip(skip).limit(lim).lean(),
      GmbReview.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: { reviews, total, page: Number(page), limit: lim },
    });
  } catch (err) {
    logger.error('[gmb] /reviews failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
});

router.post('/reviews/:reviewId/reply', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_REVIEWS_REPLY), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.locationId) {
      return res.status(400).json({ success: false, error: 'GMB location not configured' });
    }

    const { replyText, useAi } = req.body || {};
    const { GmbReview, BusinessSettings } = ctx.businessModels;
    const review = await GmbReview.findOne({ reviewId: req.params.reviewId });
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    let text = replyText;
    if (useAi) {
      const settings = await BusinessSettings.findOne().lean();
      text = await generateReply({
        salonName: settings?.businessName || 'Our salon',
        city: settings?.city || '',
        reviewerName: review.reviewerName,
        starRating: review.starRating,
        reviewText: review.comment,
        tone: ctx.account.replyTone,
        language: ctx.account.replyLanguage,
      });
    }

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'Reply text is required' });
    }

    await gmbService.postReviewReply(ctx.account, review.reviewId, String(text).trim());
    review.replyText = String(text).trim();
    review.replySource = useAi ? 'ai_draft_approved' : 'manual';
    review.repliedAt = new Date();
    review.autoReplyProcessed = true;
    await review.save();

    await logSync(ctx.businessModels, {
      locationId: ctx.account.locationId,
      operation: 'review_reply',
      status: 'success',
      message: `Replied to review ${review.reviewId}`,
    });

    return res.json({ success: true, data: { review } });
  } catch (err) {
    logger.error('[gmb] /reviews/:id/reply failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to post reply' });
  }
});

router.post('/reviews/:reviewId/ai-draft', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { GmbReview, BusinessSettings } = ctx.businessModels;
    const review = await GmbReview.findOne({ reviewId: req.params.reviewId });
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    const settings = await BusinessSettings.findOne().lean();
    const draft = await generateReply({
      salonName: settings?.businessName || 'Our salon',
      city: settings?.city || '',
      reviewerName: review.reviewerName,
      starRating: review.starRating,
      reviewText: review.comment,
      tone: ctx.account?.replyTone || 'friendly',
      language: ctx.account?.replyLanguage || 'auto',
    });

    review.aiDraftText = draft;
    await review.save();
    return res.json({ success: true, data: { draft } });
  } catch (err) {
    logger.error('[gmb] ai-draft failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to generate draft' });
  }
});

router.get('/health', authenticateToken, setupBusinessDatabase, gate(FEATURE.GMB_HEALTH), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.locationId) {
      return res.status(400).json({ success: false, error: 'GMB not connected' });
    }

    const health = await computeComponentsForBranch(ctx.businessModels, ctx.account, {});
    const { GmbHealthSnapshot } = ctx.businessModels;
    const history = await GmbHealthSnapshot.find({ locationId: ctx.account.locationId })
      .sort({ snapshotDate: -1 })
      .limit(8)
      .lean();

    return res.json({ success: true, data: { ...health, history } });
  } catch (err) {
    logger.error('[gmb] /health failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to compute health score' });
  }
});

router.get('/insights', authenticateToken, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.locationId) {
      return res.status(400).json({ success: false, error: 'GMB not connected' });
    }

    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const raw = await gmbService.fetchInsights(ctx.account, start.toISOString(), end.toISOString());

    return res.json({
      success: true,
      data: {
        period: { start, end },
        raw,
        summary: raw
          ? 'Insights synced from Google Business Profile.'
          : 'Insights unavailable — check API permissions or quota.',
      },
    });
  } catch (err) {
    logger.error('[gmb] /insights failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch insights' });
  }
});

router.put('/settings', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account) return res.status(400).json({ success: false, error: 'Not connected' });

    const allowed = [
      'autoReplyEnabled',
      'autoReplyMode',
      'autoReplyDelay',
      'replyTone',
      'replyLanguage',
      'reviewRequestEnabled',
      'reviewRequestDelayMinutes',
      'reviewRequestCooldownDays',
      'negativeAlertEnabled',
      'negativeAlertThreshold',
      'negativeAlertEscalationHours',
      'negativeAlertRecipients',
      'postingEnabled',
      'postFrequency',
      'postMode',
      'postTopics',
      'servicesSyncEnabled',
      'hoursSyncEnabled',
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) ctx.account[key] = req.body[key];
    }
    await ctx.account.save();
    return res.json({ success: true, data: publicAccountView(ctx.account) });
  } catch (err) {
    logger.error('[gmb] /settings failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

router.post('/posts/generate', authenticateToken, requireManager, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { topic, triggerType = 'manual' } = req.body || {};
    const { GmbPost, BusinessSettings } = ctx.businessModels;
    const settings = await BusinessSettings.findOne().lean();
    const salonName = settings?.businessName || 'Our salon';

    const draftText = `${topic || 'Visit us for a fresh look!'} — ${salonName}`;
    const post = await GmbPost.create({
      locationId: ctx.account?.locationId || 'unknown',
      triggerType,
      topic: topic || '',
      draftText,
      imagePrompt: `Salon promotional image for ${salonName}, modern, bright, professional`,
      status: 'draft',
    });

    return res.json({ success: true, data: { post } });
  } catch (err) {
    logger.error('[gmb] /posts/generate failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate post' });
  }
});

router.post('/posts/publish', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.locationId) {
      return res.status(400).json({ success: false, error: 'GMB not connected' });
    }

    const { postId } = req.body || {};
    const { GmbPost } = ctx.businessModels;
    const post = await GmbPost.findById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const result = await gmbService.publishLocalPost(ctx.account, {
      summary: post.draftText,
      imageUrl: post.imageUrl,
      ctaType: post.ctaType,
    });

    post.status = 'published';
    post.publishedAt = new Date();
    post.googlePostId = result.name || null;
    await post.save();

    return res.json({ success: true, data: { post } });
  } catch (err) {
    logger.error('[gmb] /posts/publish failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to publish post' });
  }
});

router.get('/posts', authenticateToken, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { GmbPost } = ctx.businessModels;
    const posts = await GmbPost.find().sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ success: true, data: { posts } });
  } catch (err) {
    logger.error('[gmb] /posts failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to list posts' });
  }
});

router.post('/sync/services', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_SYNC), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.locationId) {
      return res.status(400).json({ success: false, error: 'GMB not connected' });
    }

    const { Service } = ctx.businessModels;
    const services = await Service.find().lean();
    await gmbService.syncServicesToGmb(ctx.account, services);

    await logSync(ctx.businessModels, {
      locationId: ctx.account.locationId,
      operation: 'services_sync',
      status: 'success',
      message: `Synced ${services.length} services`,
    });

    return res.json({ success: true, data: { synced: services.length } });
  } catch (err) {
    logger.error('[gmb] /sync/services failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Services sync failed' });
  }
});

router.post('/sync/hours', authenticateToken, requireManager, setupMainDatabase, setupBusinessDatabase, gate(FEATURE.GMB_SYNC), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });
    if (!ctx.account?.locationId) {
      return res.status(400).json({ success: false, error: 'GMB not connected' });
    }

    const hours = req.body?.regularHours || null;
    if (!hours) {
      return res.status(400).json({ success: false, error: 'regularHours required' });
    }

    await gmbService.syncHoursToGmb(ctx.account, hours);
    await logSync(ctx.businessModels, {
      locationId: ctx.account.locationId,
      operation: 'hours_sync',
      status: 'success',
    });

    return res.json({ success: true, data: { synced: true } });
  } catch (err) {
    logger.error('[gmb] /sync/hours failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Hours sync failed' });
  }
});

router.get('/conversion-report', authenticateToken, setupBusinessDatabase, gate(FEATURE.GMB_CONVERSION_TRACKING), async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { Appointment } = ctx.businessModels;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const gmbAppointments = await Appointment.find({
      utmSource: 'google',
      utmMedium: 'gmb',
      createdAt: { $gte: monthStart },
    }).lean();

    const revenue = gmbAppointments.reduce((sum, a) => sum + (Number(a.estimatedRevenue) || 0), 0);

    return res.json({
      success: true,
      data: {
        bookings: gmbAppointments.length,
        revenue,
        month: monthStart.toISOString().slice(0, 7),
      },
    });
  } catch (err) {
    logger.error('[gmb] /conversion-report failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load conversion report' });
  }
});

router.get('/ad-triggers', authenticateToken, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { GmbAdTrigger } = ctx.businessModels;
    const triggers = await GmbAdTrigger.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({ success: true, data: { triggers } });
  } catch (err) {
    logger.error('[gmb] /ad-triggers failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load ad triggers' });
  }
});

router.post('/ad-triggers/:id/approve', authenticateToken, requireManager, setupBusinessDatabase, gate(FEATURE.GMB_CONNECT), requireGmbAddon, async (req, res) => {
  try {
    const ctx = await resolveBusinessContext(req);
    if (ctx.error) return res.status(400).json({ success: false, error: ctx.error });

    const { GmbAdTrigger } = ctx.businessModels;
    const trigger = await GmbAdTrigger.findById(req.params.id);
    if (!trigger) return res.status(404).json({ success: false, error: 'Trigger not found' });

    trigger.status = 'approved';
    trigger.launchedAt = new Date();
    await trigger.save();

    return res.json({ success: true, data: { trigger } });
  } catch (err) {
    logger.error('[gmb] /ad-triggers approve failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to approve trigger' });
  }
});

router.get('/reserve-with-google/status', authenticateToken, gate(FEATURE.GMB_CONNECT), async (_req, res) => {
  return res.json({
    success: true,
    data: {
      partnerStatus: 'not_applied',
      message:
        'Reserve with Google requires a formal Google partner application. Submit via Google Partner program.',
      applicationUrl: 'https://developers.google.com/maps-booking',
    },
  });
});

module.exports = router;
