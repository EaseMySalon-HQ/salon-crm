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
  submitTemplateForGupshupApproval,
};
