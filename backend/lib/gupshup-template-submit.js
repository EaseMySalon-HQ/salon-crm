'use strict';

/**
 * Shared Gupshup Partner Portal template apply (POST /partner/app/{appId}/templates).
 * Used by tenant WhatsApp → Templates and admin Platform Template Manager.
 */

const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { buildGupshupApplyFields } = require('./gupshup-template-apply-fields');

function gupshupPartnerTemplatesPath(appId) {
  return `/partner/app/${encodeURIComponent(String(appId))}/templates`;
}

function extractRemoteTemplateId(submissionData) {
  if (!submissionData) return null;
  const id =
    submissionData.template?.id || submissionData.id || submissionData.templateId || null;
  return id ? String(id) : null;
}

function gupshupSubmissionErrorMessage(submission) {
  if (submission?.status === 429) {
    return 'Gupshup rate limit: max 10 template calls per minute per app. Wait 60 seconds, then submit again.';
  }
  if (typeof submission?.error === 'string') return submission.error;
  if (submission?.error?.message) return submission.error.message;
  return 'Gupshup rejected the template submission';
}

/** Gupshup returns this when elementName already exists on the connected WABA. */
function isGupshupTemplateDuplicateError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('already exists') && text.includes('elementname');
}

/**
 * Throttling / upstream outages are retryable — they must not flip a draft to
 * "rejected", which would hide the template behind a rename prompt.
 */
function isGupshupTransientSubmitFailure(submission) {
  const status = submission?.status;
  return status === 408 || status === 429 || (typeof status === 'number' && status >= 500);
}

/**
 * Submit a local template draft to Gupshup for Meta approval on the given app (WABA).
 */
async function submitTemplateForGupshupApproval({ appId, templateDoc }) {
  const partnerApiPath = gupshupPartnerTemplatesPath(appId);
  const submission = await gupshupWhatsApp.applyTemplate({
    appId,
    fields: buildGupshupApplyFields(templateDoc),
  });
  return {
    partnerApiPath,
    partnerApiMethod: 'POST',
    submission,
    remoteId: submission.success ? extractRemoteTemplateId(submission.data) : null,
    errorMessage: submission.success ? null : gupshupSubmissionErrorMessage(submission),
  };
}

module.exports = {
  gupshupPartnerTemplatesPath,
  extractRemoteTemplateId,
  gupshupSubmissionErrorMessage,
  isGupshupTemplateDuplicateError,
  isGupshupTransientSubmitFailure,
  submitTemplateForGupshupApproval,
};
