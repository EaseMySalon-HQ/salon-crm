'use strict';

/** Tenant may remove locally and re-import from Add templates. */
const REPLACEABLE_LIBRARY_STATUSES = ['pending', 'rejected'];

function isReplaceableTenantTemplateStatus(status) {
  return REPLACEABLE_LIBRARY_STATUSES.includes(String(status || ''));
}

/** DELETE without ?force=1 — draft plus failed/in-review library rows. */
function canDeleteTenantTemplateWithoutForce(tpl) {
  const status = tpl?.status;
  if (status === 'draft') return true;
  return isReplaceableTenantTemplateStatus(status);
}

module.exports = {
  REPLACEABLE_LIBRARY_STATUSES,
  isReplaceableTenantTemplateStatus,
  canDeleteTenantTemplateWithoutForce,
};
