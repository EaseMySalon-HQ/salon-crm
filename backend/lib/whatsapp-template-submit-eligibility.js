'use strict';

/**
 * Whether a tenant may POST /whatsapp-templates/:id/submit.
 * Transactional library imports may be resubmitted from pending when a prior
 * submit never landed on the tenant WABA (reconcile leaves status pending).
 */
function isTransactionalLibraryTemplate(tpl) {
  if (!tpl?.sourcePlatformTemplateId) return false;
  return String(tpl.category || '').toUpperCase() === 'UTILITY';
}

function canTenantSubmitTemplate(tpl) {
  const status = tpl?.status;
  if (status === 'draft' || status === 'rejected') return true;
  if (status === 'pending' && isTransactionalLibraryTemplate(tpl)) return true;
  return false;
}

module.exports = {
  isTransactionalLibraryTemplate,
  canTenantSubmitTemplate,
};
