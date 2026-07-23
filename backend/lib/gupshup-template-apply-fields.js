'use strict';

function hasDynamicUrlPlaceholders(url) {
  return typeof url === 'string' && /\{\{\d+\}\}/.test(url);
}

function buildUrlButtonPayload(b) {
  const url = b.url || '';
  const payload = {
    type: 'URL',
    text: b.text,
    url,
    buttonValue: url,
    suffix: '',
  };
  if (hasDynamicUrlPlaceholders(url)) {
    const exampleUrl = String(b.urlExample || b.example?.[0] || '').trim();
    if (exampleUrl) payload.example = [exampleUrl];
  }
  return payload;
}

/**
 * Build Gupshup `POST /partner/app/{appId}/templates` form fields from a local
 * template shape (WhatsAppTemplate doc or catalog entry).
 */
function buildGupshupApplyFields(tpl) {
  const c = tpl.components || {};
  const bodyText = c.body?.text || tpl.content || '';
  const exampleRow = Array.isArray(c.body?.examples?.[0]) ? c.body.examples[0] : tpl.exampleParams || [];
  const exampleStr = exampleRow.length
    ? bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => String(exampleRow[parseInt(n, 10) - 1] ?? ''))
    : bodyText.replace(/\{\{\d+\}\}/g, 'sample');

  const fields = {
    elementName: tpl.name || tpl.elementName,
    languageCode: String(tpl.language || 'en_US').replace('-', '_'),
    category: String(tpl.category || 'UTILITY').toUpperCase(),
    templateType: tpl.templateType || 'TEXT',
    vertical: tpl.vertical || 'salon_crm',
    content: bodyText,
    example: exampleStr,
    enableSample: 'true',
    allowTemplateCategoryChange: 'true',
  };
  if (c.header?.text) {
    fields.header = c.header.text;
    fields.exampleHeader = c.header.text;
  }
  if (c.footer?.text) {
    fields.footer = c.footer.text;
  }
  if (Array.isArray(c.buttons) && c.buttons.length) {
    fields.buttons = JSON.stringify(
      c.buttons.map((b) => {
        if (b.type === 'URL') {
          return buildUrlButtonPayload(b);
        }
        if (b.type === 'PHONE_NUMBER') {
          return { type: 'PHONE_NUMBER', text: b.text, phone: b.phone };
        }
        return { type: 'QUICK_REPLY', text: b.text };
      })
    );
  }
  return fields;
}

function extractTemplateList(data) {
  if (Array.isArray(data?.templates)) return data.templates;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

function remoteElementName(remote) {
  return String(remote?.elementName || remote?.name || '').trim();
}

function remoteTemplateId(remote) {
  return String(remote?.id || remote?.templateId || '').trim();
}

function remoteTemplateStatus(remote) {
  return String(remote?.status || remote?.templateStatus || '').toUpperCase();
}

/**
 * Unwrap Gupshup GET template / list item shapes. API envelopes use
 * `{ status: "success", template: { status: "APPROVED", ... } }` — the outer
 * status must not be treated as the template approval state.
 */
function normalizeGupshupTemplateRecord(data) {
  if (!data || typeof data !== 'object') return {};
  const nested =
    data.template && typeof data.template === 'object' && !Array.isArray(data.template)
      ? data.template
      : null;
  const remote = nested || data;
  const envelopeStatus = String(data.status || '').toLowerCase();
  const templateStatus =
    remote.status ||
    remote.templateStatus ||
    remote.state ||
    (envelopeStatus === 'success' || envelopeStatus === 'error' ? null : data.status);

  return {
    ...remote,
    id: remote.id || remote.templateId || data.id || data.templateId || null,
    status: templateStatus,
    name: remote.elementName || remote.name || data.elementName || data.name || null,
    elementName: remote.elementName || remote.name || data.elementName || data.name || null,
    language: remote.languageCode || remote.language || data.languageCode || data.language || null,
    rejectedReason:
      remote.rejectedReason || remote.rejectionReason || remote.rejected_reason || null,
    rejected_reason:
      remote.rejected_reason || remote.rejectedReason || remote.rejectionReason || null,
  };
}

module.exports = {
  buildGupshupApplyFields,
  buildUrlButtonPayload,
  hasDynamicUrlPlaceholders,
  extractTemplateList,
  remoteElementName,
  remoteTemplateId,
  remoteTemplateStatus,
  normalizeGupshupTemplateRecord,
};
