/**
 * GMB Health Score calculator (weighted components per PRD).
 */

'use strict';

const WEIGHTS = {
  profileCompleteness: 0.2,
  recentPostActivity: 0.2,
  reviewResponseRate: 0.2,
  photoRecency: 0.15,
  serviceListCompleteness: 0.15,
  qaAnswered: 0.1,
};

function computeHealthScore(components) {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const val = Math.min(100, Math.max(0, Number(components[key]) || 0));
    score += val * weight;
  }
  return Math.round(score);
}

async function computeComponentsForBranch(businessModels, account, locationMeta) {
  const { GmbReview, GmbPost, Service, BusinessSettings } = businessModels;

  const settings = await BusinessSettings.findOne().lean();
  const services = await Service.find({ isActive: { $ne: false } }).lean();
  const activeServices = services.filter((s) => s.isActive !== false);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const reviews = await GmbReview.find({
    locationId: account.locationId,
    createTime: { $gte: thirtyDaysAgo },
  }).lean();

  const replied = reviews.filter((r) => r.replyText).length;
  const reviewResponseRate = reviews.length > 0 ? Math.round((replied / reviews.length) * 100) : 100;

  const recentPost = await GmbPost.findOne({
    locationId: account.locationId,
    status: 'published',
    publishedAt: { $gte: sevenDaysAgo },
  }).lean();

  const profileFields = [
    settings?.businessName,
    settings?.address,
    settings?.phone,
    settings?.googleMapsUrl,
    account.locationId,
  ];
  const filled = profileFields.filter(Boolean).length;
  const profileCompleteness = Math.round((filled / profileFields.length) * 100);

  const components = {
    profileCompleteness,
    recentPostActivity: recentPost ? 100 : 0,
    reviewResponseRate,
    photoRecency: locationMeta?.hasRecentPhoto ? 100 : 0,
    serviceListCompleteness:
      activeServices.length > 0 && account.servicesSyncEnabled ? 100 : activeServices.length > 0 ? 50 : 0,
    qaAnswered: locationMeta?.qaAnsweredPct ?? 50,
  };

  return {
    score: computeHealthScore(components),
    components,
  };
}

function scoreColor(score) {
  if (score < 50) return 'red';
  if (score < 75) return 'amber';
  return 'green';
}

module.exports = {
  computeHealthScore,
  computeComponentsForBranch,
  scoreColor,
  WEIGHTS,
};
