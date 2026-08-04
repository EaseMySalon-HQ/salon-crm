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

function duplicateSubmitAction(remote) {
  if (!remote) return 'submit';
  const status = remoteApprovalStatus(remote);
  if (status === 'rejected') return 'needs_rename';
  if (status === 'pending' || status === 'approved') return 'link_existing';
  return 'link_existing';
}

module.exports = {
  suggestAlternateTemplateName,
  findRemoteByNameLang,
  mapRemoteApprovalStatus,
  remoteApprovalStatus,
  clearStaleTenantTemplateIds,
  duplicateSubmitAction,
};
