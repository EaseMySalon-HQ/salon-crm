/**
 * Google Business Profile API client.
 */

'use strict';

const { google } = require('googleapis');
const { encrypt, decrypt } = require('../lib/crypto');
const { getGmbConfig } = require('../lib/google-business-config');
const { logger } = require('../utils/logger');

const refreshLocks = new Map();

async function getOAuthClient() {
  const cfg = await getGmbConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Google OAuth credentials are not configured');
  }
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

function starRatingToNumber(starRating) {
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  if (typeof starRating === 'number') return starRating;
  return map[String(starRating || '').toUpperCase()] || 0;
}

function numberToStarEnum(n) {
  const map = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE' };
  return map[n] || 'FIVE';
}

async function withRefreshLock(accountId, fn) {
  while (refreshLocks.has(accountId)) {
    await refreshLocks.get(accountId);
  }
  let release;
  const p = new Promise((resolve) => {
    release = resolve;
  });
  refreshLocks.set(accountId, p);
  try {
    return await fn();
  } finally {
    refreshLocks.delete(accountId);
    release();
  }
}

async function getAuthenticatedClient(accountDoc) {
  const oauth2 = await getOAuthClient();
  if (!accountDoc.accessTokenCipher || !accountDoc.refreshTokenCipher) {
    throw new Error('GMB account tokens missing');
  }
  oauth2.setCredentials({
    access_token: decrypt(accountDoc.accessTokenCipher),
    refresh_token: decrypt(accountDoc.refreshTokenCipher),
    expiry_date: accountDoc.expiryDate ? new Date(accountDoc.expiryDate).getTime() : null,
  });

  const needsRefresh =
    !accountDoc.expiryDate || new Date(accountDoc.expiryDate).getTime() < Date.now() + 60_000;

  if (needsRefresh) {
    await withRefreshLock(String(accountDoc._id), async () => {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      accountDoc.accessTokenCipher = encrypt(credentials.access_token);
      if (credentials.refresh_token) {
        accountDoc.refreshTokenCipher = encrypt(credentials.refresh_token);
      }
      accountDoc.expiryDate = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600_000);
      accountDoc.tokenLastUsedAt = new Date();
      await accountDoc.save();
    });
  }

  return oauth2;
}

function getAccountManagement(auth) {
  return google.mybusinessaccountmanagement({ version: 'v1', auth });
}

function getBusinessInfo(auth) {
  return google.mybusinessbusinessinformation({ version: 'v1', auth });
}

async function generateAuthUrl({ businessId, branchId, userId }) {
  const { signState } = require('../lib/gmb-oauth-state');
  const oauth2 = await getOAuthClient();
  const cfg = await getGmbConfig();
  const state = signState({ businessId: String(businessId), branchId: branchId ? String(branchId) : null, userId: String(userId) });
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [cfg.scope],
    state,
  });
}

async function exchangeCode(code) {
  const oauth2 = await getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

async function revokeToken(refreshTokenCipher) {
  if (!refreshTokenCipher) return;
  try {
    const oauth2 = await getOAuthClient();
    const token = decrypt(refreshTokenCipher);
    await oauth2.revokeToken(token);
  } catch (err) {
    logger.warn('[gmb] revokeToken failed:', err?.message || err);
  }
}

async function listAccounts(accountDoc) {
  const auth = await getAuthenticatedClient(accountDoc);
  const api = getAccountManagement(auth);
  const res = await api.accounts.list();
  return res.data.accounts || [];
}

async function listLocations(accountDoc, accountName) {
  const auth = await getAuthenticatedClient(accountDoc);
  const api = getBusinessInfo(auth);
  const parent = accountName.startsWith('accounts/') ? accountName : `accounts/${accountName}`;
  const res = await api.accounts.locations.list({
    parent,
    readMask: 'name,title,storefrontAddress,metadata',
  });
  return res.data.locations || [];
}

async function fetchReviews(accountDoc) {
  const auth = await getAuthenticatedClient(accountDoc);
  if (!accountDoc.accountId || !accountDoc.locationId) return [];

  const accountPart = accountDoc.accountId.replace(/^accounts\//, '');
  const locationPart = accountDoc.locationId.replace(/^locations\//, '');
  const parent = `accounts/${accountPart}/locations/${locationPart}`;

  const mybusiness = google.mybusiness({ version: 'v4', auth });
  const reviews = [];
  let pageToken;

  do {
    const res = await mybusiness.accounts.locations.reviews.list({
      parent,
      pageSize: 50,
      pageToken,
    });
    const batch = res.data.reviews || [];
    reviews.push(...batch);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return reviews.map((r) => ({
    reviewId: r.reviewId || r.name,
    reviewerName: r.reviewer?.displayName || 'Anonymous',
    starRating: starRatingToNumber(r.starRating),
    comment: r.comment || '',
    createTime: r.createTime ? new Date(r.createTime) : null,
    updateTime: r.updateTime ? new Date(r.updateTime) : null,
    replyText: r.reviewReply?.comment || null,
    repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
  }));
}

async function postReviewReply(accountDoc, reviewId, replyText) {
  const auth = await getAuthenticatedClient(accountDoc);
  const accountPart = accountDoc.accountId.replace(/^accounts\//, '');
  const locationPart = accountDoc.locationId.replace(/^locations\//, '');
  const name = `accounts/${accountPart}/locations/${locationPart}/reviews/${reviewId}`;

  const mybusiness = google.mybusiness({ version: 'v4', auth });
  const res = await mybusiness.accounts.locations.reviews.updateReply({
    name,
    requestBody: { comment: replyText },
  });
  return res.data;
}

async function publishLocalPost(accountDoc, { summary, imageUrl, ctaType }) {
  const auth = await getAuthenticatedClient(accountDoc);
  const accountPart = accountDoc.accountId.replace(/^accounts\//, '');
  const locationPart = accountDoc.locationId.replace(/^locations\//, '');
  const parent = `accounts/${accountPart}/locations/${locationPart}`;

  const mybusiness = google.mybusiness({ version: 'v4', auth });
  const media = imageUrl
    ? [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }]
    : undefined;

  const res = await mybusiness.accounts.locations.localPosts.create({
    parent,
    requestBody: {
      languageCode: 'en',
      summary,
      media,
      callToAction: ctaType ? { actionType: ctaType } : undefined,
      topicType: 'STANDARD',
    },
  });
  return res.data;
}

async function fetchInsights(accountDoc, startDate, endDate) {
  const auth = await getAuthenticatedClient(accountDoc);
  const accountPart = accountDoc.accountId.replace(/^accounts\//, '');
  const locationPart = accountDoc.locationId.replace(/^locations\//, '');
  const name = `accounts/${accountPart}/locations/${locationPart}`;

  const mybusiness = google.mybusiness({ version: 'v4', auth });
  try {
    const res = await mybusiness.accounts.locations.reportInsights({
      name,
      requestBody: {
        locationNames: [name],
        basicRequest: {
          metricRequests: [
            { metric: 'QUERIES_DIRECT' },
            { metric: 'QUERIES_INDIRECT' },
            { metric: 'VIEWS_MAPS' },
            { metric: 'VIEWS_SEARCH' },
            { metric: 'ACTIONS_WEBSITE' },
            { metric: 'ACTIONS_PHONE' },
            { metric: 'ACTIONS_DRIVING_DIRECTIONS' },
          ],
          timeRange: { startTime: startDate, endTime: endDate },
        },
      },
    });
    return res.data;
  } catch (err) {
    logger.warn('[gmb] fetchInsights failed:', err?.message || err);
    return null;
  }
}

async function syncServicesToGmb(accountDoc, services) {
  const auth = await getAuthenticatedClient(accountDoc);
  const api = getBusinessInfo(auth);
  const locationName = accountDoc.locationId.startsWith('locations/')
    ? accountDoc.locationId
    : `locations/${accountDoc.locationId}`;

  const serviceItems = services
    .filter((s) => s.isActive !== false)
    .map((s) => ({
      structuredServiceItem: {
        serviceTypeId: 'job_type_id:hair_salon',
        description: s.name,
      },
      price: s.price
        ? { currencyCode: 'INR', units: String(Math.floor(s.price)) }
        : undefined,
    }));

  const res = await api.locations.patch({
    name: locationName,
    updateMask: 'serviceItems',
    requestBody: { serviceItems },
  });
  return res.data;
}

async function syncHoursToGmb(accountDoc, hours) {
  const auth = await getAuthenticatedClient(accountDoc);
  const api = getBusinessInfo(auth);
  const locationName = accountDoc.locationId.startsWith('locations/')
    ? accountDoc.locationId
    : `locations/${accountDoc.locationId}`;

  const res = await api.locations.patch({
    name: locationName,
    updateMask: 'regularHours',
    requestBody: { regularHours: hours },
  });
  return res.data;
}

module.exports = {
  generateAuthUrl,
  exchangeCode,
  revokeToken,
  listAccounts,
  listLocations,
  fetchReviews,
  postReviewReply,
  publishLocalPost,
  fetchInsights,
  syncServicesToGmb,
  syncHoursToGmb,
  starRatingToNumber,
  numberToStarEnum,
  getAuthenticatedClient,
};
