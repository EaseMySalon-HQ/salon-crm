'use strict';

/**
 * Resolve report email recipients for a branch, including multi-branch owners
 * and staff selected by ID on another branch (matched by email on this branch).
 */

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const {
  staffEmailPreferenceFindQuery,
  staffWantsEmailPreference,
} = require('./admin-email-preferences');
const { getAllActiveBranchesForOwner } = require('./get-all-branches');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Deduplicate recipients by email within a single branch send. */
function mergeRecipientsByEmail(recipients) {
  const byEmail = new Map();
  for (const r of recipients || []) {
    const key = normalizeEmail(r.email);
    if (!key) continue;
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        _id: r._id,
        name: r.name || r.email,
        email: r.email,
        role: r.role,
      });
    }
  }
  return Array.from(byEmail.values());
}

/**
 * Business owner + branch-scoped admin users (owner receives every branch's reports).
 */
async function resolveAdminRecipientsForBusiness(business, mainConnection) {
  const User = mainConnection.model('User', require('../models/User').schema);
  const out = [];
  const seen = new Set();

  const push = (user) => {
    const key = normalizeEmail(user?.email);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      _id: user._id,
      name:
        user.name ||
        `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
        user.email,
      email: user.email,
      role: user.role || 'admin',
    });
  };

  if (business.owner) {
    const owner = await User.findById(business.owner)
      .select('name firstName lastName email role')
      .lean();
    if (owner?.email && owner.role === 'admin') {
      push(owner);
    }
  }

  const branchAdmins = await User.find({
    branchId: business._id,
    role: 'admin',
    email: { $exists: true, $ne: '' },
  })
    .select('name firstName lastName email role')
    .lean();

  for (const admin of branchAdmins) {
    push(admin);
  }

  return out;
}

/**
 * Map configured staff IDs (possibly from another branch's settings) to email addresses
 * by scanning all active branches owned by the same owner.
 */
async function collectEmailsForStaffIdsAcrossOwnerBranches(mainConnection, ownerId, staffIds) {
  if (!ownerId || !staffIds?.length) return [];

  const branches = await getAllActiveBranchesForOwner(mainConnection, ownerId);
  const emails = new Set();
  const idSet = new Set(staffIds.map((id) => String(id)));

  for (const branch of branches) {
    try {
      const businessDb = await databaseManager.getConnection(branch.id, mainConnection);
      const { Staff } = modelFactory.createBusinessModels(businessDb);
      const rows = await Staff.find({ _id: { $in: [...idSet] } })
        .select('email')
        .lean();
      for (const row of rows) {
        const email = normalizeEmail(row.email);
        if (email) emails.add(email);
      }
    } catch {
      // Skip branch connection failures; other branches may still resolve emails.
    }
  }

  return [...emails];
}

/**
 * Staff recipients for a report type on this branch.
 */
async function resolveStaffReportRecipients({
  business,
  businessModels,
  mainConnection,
  prefKey,
  recipientStaffIds = [],
}) {
  const { Staff } = businessModels;
  const branchId = business._id;
  let staff = [];

  if (recipientStaffIds.length > 0) {
    staff = await Staff.find(staffEmailPreferenceFindQuery(prefKey, { recipientStaffIds }))
      .select('name email role emailNotifications')
      .lean();

    // Multi-branch: recipient IDs from another branch's DB — match by email here.
    if (staff.length === 0 && business.owner) {
      const emails = await collectEmailsForStaffIdsAcrossOwnerBranches(
        mainConnection,
        business.owner,
        recipientStaffIds,
      );
      if (emails.length > 0) {
        const candidates = await Staff.find({
          branchId,
          email: { $exists: true, $ne: '' },
        })
          .select('name email role emailNotifications')
          .lean();
        staff = candidates.filter(
          (s) =>
            emails.includes(normalizeEmail(s.email)) &&
            staffWantsEmailPreference(s, prefKey),
        );
      }
    }
  } else {
    staff = await Staff.find(staffEmailPreferenceFindQuery(prefKey, { branchId }))
      .select('name email role')
      .lean();
  }

  return staff;
}

/**
 * Staff + admin recipients for scheduled/operational report emails on one branch.
 */
async function resolveReportRecipients({
  business,
  businessModels,
  mainConnection,
  prefKey,
  recipientStaffIds = [],
}) {
  const staff = await resolveStaffReportRecipients({
    business,
    businessModels,
    mainConnection,
    prefKey,
    recipientStaffIds,
  });
  const admins = await resolveAdminRecipientsForBusiness(business, mainConnection);
  return mergeRecipientsByEmail([...staff, ...admins]);
}

module.exports = {
  normalizeEmail,
  mergeRecipientsByEmail,
  resolveAdminRecipientsForBusiness,
  collectEmailsForStaffIdsAcrossOwnerBranches,
  resolveStaffReportRecipients,
  resolveReportRecipients,
};
