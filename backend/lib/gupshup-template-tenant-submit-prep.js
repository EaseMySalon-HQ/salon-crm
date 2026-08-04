'use strict';

const {
  normalizeGupshupTemplateRecord,
  remoteElementName,
} = require('./gupshup-template-apply-fields');

function suggestAlternateTemplateName(currentName) {
  const raw = String(currentName || 'template')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const match = raw.match(/^(.+?)_v(\d+)$/);
  if (match) {
    const base = match[1];
    const next = parseInt(match[2], 10) + 1;
    return `${base}_v${next}`.slice(0, 512);
  }
  return `${raw}_v2`.slice(0, 512);
}

function findRemoteByNameLang(remoteList, elementName, language) {
  const wantLang = String(language || '').replace('-', '_');
  return (
    (remoteList || []).find((raw) => {
      const normalized = normalizeGupshupTemplateRecord(raw);
      const name = remoteElementName(normalized);
      const lang = String(normalized.language || normalized.languageCode || '').replace('-', '_');
      if (name !== elementName) return false;
      return !wantLang || !lang || lang === wantLang;
    }) || null
  );
}

function mapRemoteApprovalStatus(remoteStatus) {
  const s = String(remoteStatus || '').toUpperCase();
  switch (s) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'PENDING':
    case 'SUBMITTED':
      return 'pending';
    case 'PAUSED':
    case 'DEACTIVATED':
      return 'paused';
    case 'IN_APPEAL':
      return 'in_appeal';
    // Gupshup keeps the row (and holds the elementName) after Meta refuses or
    // drops the template, even though it never becomes visible in WhatsApp Manager.
    case 'FAILED':
      return 'failed';
    case 'DELETED':
      return 'deleted';
    case 'DISABLED':
      return 'disabled';
    default:
      return null;
  }
}

function remoteApprovalStatus(remote) {
  if (!remote) return null;
  const normalized = normalizeGupshupTemplateRecord(remote);
  return mapRemoteApprovalStatus(normalized.status);
}

/**
 * Drop platform WABA ids mistaken for tenant ids so POST creates on the salon app.
 */
function clearStaleTenantTemplateIds(tpl, { remote, platformGupshupId }) {
  if (remote) return false;
  const localId = String(tpl.gupshupTemplateId || tpl.metaTemplateId || '');
  const platformId = platformGupshupId ? String(platformGupshupId) : '';
  const stalePlatformId = Boolean(platformId && localId && localId === platformId);
  const pendingLibraryResubmit =
    tpl.status === 'pending' && tpl.sourcePlatformTemplateId && !localId;
  const rejectedResubmit = tpl.status === 'rejected';

  if (stalePlatformId || pendingLibraryResubmit || rejectedResubmit || (!localId && tpl.status === 'draft')) {
    tpl.gupshupTemplateId = null;
    tpl.metaTemplateId = null;
    return true;
  }
  return false;
}

/** Only these remote states are live on Meta, so only these are worth linking to. */
const LINKABLE_REMOTE_STATUSES = new Set(['approved', 'pending', 'paused', 'in_appeal']);

/**
 * A remote in any other state (rejected, failed, deleted, or a status we cannot
 * map) is not live on Meta but still holds the elementName. Linking to it would
 * silently leave the local row a draft Meta never sees, so the name has to be
 * deleted and re-applied for instead.
 */
function duplicateSubmitAction(remote) {
  if (!remote) return 'submit';
  return LINKABLE_REMOTE_STATUSES.has(remoteApprovalStatus(remote))
    ? 'link_existing'
    : 'reclaim_name';
}

/** Deleting a remote that is live on Meta would take a working template down. */
function canReclaimRemoteName(remote) {
  if (!remote) return false;
  return !LINKABLE_REMOTE_STATUSES.has(remoteApprovalStatus(remote));
}

function duplicateBlockReason(remote) {
  switch (remoteApprovalStatus(remote)) {
    case 'rejected':
      return 'Meta rejected this template name on your WhatsApp account. Choose a new name and submit again.';
    case 'failed':
    case 'deleted':
    case 'disabled':
      return 'An earlier attempt is holding this name on your WhatsApp account but Meta never accepted it, so it cannot be reused. Choose a new name and submit again.';
    default:
      return 'This template name is already registered on your WhatsApp account. Choose a new name and submit again.';
  }
}

module.exports = {
  suggestAlternateTemplateName,
  findRemoteByNameLang,
  mapRemoteApprovalStatus,
  remoteApprovalStatus,
  clearStaleTenantTemplateIds,
  duplicateSubmitAction,
  canReclaimRemoteName,
  duplicateBlockReason,
};
