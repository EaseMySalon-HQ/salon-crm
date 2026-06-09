/**
 * Owner-level shared client profiles across branch tenant databases.
 * When enabled, staff at any branch can find clients from sibling branches;
 * a local profile is created at the current branch on first lookup (by phone).
 */

const mongoose = require('mongoose');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { fanOut } = require('./branch-fanout');
const { getBusinessModel, getAllActiveBranchesForOwner } = require('./get-all-branches');
const { normalizePhone } = require('./branch-management-helpers');
const { defaultWhatsappConsentForNewClient } = require('./client-consent');
const { DEFAULTS } = require('./client-communication-consent');

const PROFILE_FIELDS = ['name', 'phone', 'email', 'gender', 'dob'];

async function resolveOwnerShareClientsContext(mainConnection, branchId) {
  if (!branchId) return null;
  const Business = getBusinessModel(mainConnection);
  const biz = await Business.findById(branchId)
    .select('owner settings.multiLocation.shareClientsAcrossBranches')
    .lean();
  if (!biz?.owner) return null;
  return {
    ownerId: biz.owner,
    shareClientsAcrossBranches: biz.settings?.multiLocation?.shareClientsAcrossBranches === true,
  };
}

async function getShareClientsAcrossBranches(mainConnection, ownerId) {
  const Business = getBusinessModel(mainConnection);
  const biz = await Business.findOne({ owner: ownerId, status: { $ne: 'deleted' } })
    .select('settings.multiLocation.shareClientsAcrossBranches')
    .lean();
  return biz?.settings?.multiLocation?.shareClientsAcrossBranches === true;
}

async function setShareClientsAcrossBranches(mainConnection, ownerId, enabled) {
  const Business = getBusinessModel(mainConnection);
  const result = await Business.updateMany(
    { owner: ownerId, status: { $ne: 'deleted' } },
    { $set: { 'settings.multiLocation.shareClientsAcrossBranches': !!enabled } }
  );
  return result.modifiedCount;
}

async function findClientByPhone(Client, phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const last10 = normalizePhone(raw);
  const query = {
    isWalkIn: { $ne: true },
    $or: [{ phone: raw }],
  };
  if (last10 && last10 !== raw) {
    query.$or.push({ phone: { $regex: new RegExp(`${last10}$`) } });
  }
  return Client.findOne(query).lean();
}

function pickProfileFields(source) {
  const doc = {};
  for (const field of PROFILE_FIELDS) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== '') {
      doc[field] = source[field];
    }
  }
  return doc;
}

async function ensureClientProfileAtBranch({ models, branchId, sourceClient }) {
  const { Client } = models;
  const existing = await findClientByPhone(Client, sourceClient.phone);
  if (existing) return existing;

  const profile = pickProfileFields(sourceClient);
  if (!profile.name || !profile.phone) {
    throw new Error('Client profile requires name and phone');
  }

  const created = await Client.create({
    ...profile,
    status: 'active',
    totalVisits: 0,
    totalSpent: 0,
    promotionalWhatsappEnabled: DEFAULTS.promotionalWhatsappEnabled,
    transactionalWhatsappEnabled: DEFAULTS.transactionalWhatsappEnabled,
    transactionalSmsEnabled: DEFAULTS.transactionalSmsEnabled,
    whatsappConsent: defaultWhatsappConsentForNewClient('import'),
    branchId: new mongoose.Types.ObjectId(String(branchId)),
  });
  return created.toObject();
}

function buildClientSearchQuery(q) {
  if (!q) return null;
  const trimmed = String(q).trim();
  if (trimmed.length < 2) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isDigits = /^\d+$/.test(escaped);
  if (isDigits) {
    return { $or: [{ phone: { $regex: `^${escaped}` } }] };
  }
  return {
    $or: [
      { name: { $regex: `^${escaped}`, $options: 'i' } },
      { phone: { $regex: `^${escaped}` } },
    ],
  };
}

async function searchClientsInBranch({ models, branchId }, { query, limit, projection }) {
  const { Client } = models;
  const filter = { isWalkIn: { $ne: true } };
  if (query) Object.assign(filter, query);

  return Client.find(filter)
    .select(projection)
    .sort({ lastVisit: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}

function annotateSharedPreviewClient(remote, sourceBranchId) {
  const phoneKey = normalizePhone(remote.phone);
  return {
    name: remote.name,
    phone: remote.phone,
    email: remote.email || undefined,
    lastVisit: remote.lastVisit || null,
    status: remote.status || 'active',
    sharedPreview: true,
    sourceBranchId: String(sourceBranchId),
    id: `shared-preview:${phoneKey}`,
  };
}

/**
 * Include sibling-branch matches in search results without creating local profiles.
 * Profiles are imported only via ensureSharedClientAtCurrentBranch (explicit open/select).
 */
async function mergeSharedClientSearchResults({
  mainConnection,
  ownerId,
  currentBranchId,
  localClients,
  query,
  limit,
  projection,
}) {
  const branches = await getAllActiveBranchesForOwner(mainConnection, ownerId);
  const siblings = branches.filter((b) => String(b.id) !== String(currentBranchId));
  if (siblings.length === 0) return localClients;

  const seenPhones = new Set(
    (localClients || []).map((c) => normalizePhone(c.phone)).filter(Boolean)
  );
  const merged = [...(localClients || [])];

  const results = await fanOut(mainConnection, siblings, (ctx) =>
    searchClientsInBranch(ctx, { query, limit, projection })
  );

  for (const row of results) {
    if (!row.data?.length) continue;
    for (const remote of row.data) {
      const phoneKey = normalizePhone(remote.phone);
      if (!phoneKey || seenPhones.has(phoneKey)) continue;

      merged.push(annotateSharedPreviewClient(remote, row.branchId));
      seenPhones.add(phoneKey);

      if (merged.length >= limit) break;
    }
    if (merged.length >= limit) break;
  }

  merged.sort((a, b) => {
    const aT = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
    const bT = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
    if (bT !== aT) return bT - aT;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return merged.slice(0, limit);
}

async function lookupClientByPhoneInBranch({ models }, phone) {
  return findClientByPhone(models.Client, phone);
}

/**
 * Create (or return) a local profile for a client found at a sibling branch.
 */
async function ensureSharedClientAtCurrentBranch({
  mainConnection,
  ownerId,
  currentBranchId,
  currentModels,
  phone,
}) {
  const rawPhone = String(phone || '').trim();
  if (!rawPhone) return null;

  const existing = await findClientByPhone(currentModels.Client, rawPhone);
  if (existing) return { client: existing, created: false };

  const branches = await getAllActiveBranchesForOwner(mainConnection, ownerId);
  const siblings = branches.filter((b) => String(b.id) !== String(currentBranchId));
  if (siblings.length === 0) return null;

  const results = await fanOut(mainConnection, siblings, (ctx) =>
    lookupClientByPhoneInBranch(ctx, rawPhone)
  );

  let sourceClient = null;
  for (const row of results) {
    if (row.data) {
      sourceClient = row.data;
      break;
    }
  }
  if (!sourceClient) return null;

  const local = await ensureClientProfileAtBranch({
    models: currentModels,
    branchId: currentBranchId,
    sourceClient,
  });
  return { client: local, created: true };
}

module.exports = {
  resolveOwnerShareClientsContext,
  getShareClientsAcrossBranches,
  setShareClientsAcrossBranches,
  ensureClientProfileAtBranch,
  ensureSharedClientAtCurrentBranch,
  findClientByPhone,
  buildClientSearchQuery,
  mergeSharedClientSearchResults,
  searchClientsInBranch,
  annotateSharedPreviewClient,
};
