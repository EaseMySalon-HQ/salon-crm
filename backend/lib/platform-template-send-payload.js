'use strict';

const { extractPlaceholderIndices } = require('./whatsapp-template-components');
const { buildGupshupParams } = require('./gupshup-template-params');

function resolveLeadField(recipient, field) {
  switch (field) {
    case 'firstName':
      return recipient.firstName || recipient.name?.split(/\s+/)[0] || 'there';
    case 'lastName':
      return recipient.lastName || '';
    case 'name':
      return recipient.name || recipient.firstName || 'there';
    case 'salonName':
      return recipient.salonName || '';
    case 'city':
      return recipient.city || '';
    case 'phone':
      return recipient.phone || '';
    case 'email':
      return recipient.email || '';
    case 'source':
      return recipient.source || '';
    case 'status':
      return recipient.status || '';
    default:
      return recipient.name || recipient.firstName || '';
  }
}

function hasDynamicUrlPlaceholders(url) {
  return typeof url === 'string' && /\{\{\d+\}\}/.test(url);
}

function resolveMappingValue(variableMapping, key, recipient, fallback = '') {
  const map = variableMapping?.[key];
  if (map && typeof map === 'object' && map.source === 'literal') {
    return String(map.value ?? '');
  }
  if (typeof map === 'string') {
    return resolveLeadField(recipient, map);
  }
  if (map && typeof map === 'object' && map.field) {
    return resolveLeadField(recipient, map.field);
  }
  if (fallback) return fallback;
  return resolveLeadField(recipient, 'firstName');
}

/**
 * Meta-style components for a platform template + lead field mapping.
 * Header params precede body params; dynamic URL button suffixes follow body.
 */
function buildPlatformCampaignComponents(template, variableMapping, recipient) {
  const components = [];
  const header = template?.components?.header;
  const body = template?.components?.body;
  const buttons = Array.isArray(template?.components?.buttons)
    ? template.components.buttons
    : [];

  if (header?.format === 'TEXT' && header.text) {
    const headerKeys = extractPlaceholderIndices(header.text);
    if (headerKeys.length > 0) {
      components.push({
        type: 'header',
        parameters: headerKeys.map((idx) => ({
          type: 'text',
          text: resolveMappingValue(
            variableMapping,
            `header_${idx}`,
            recipient,
            resolveMappingValue(variableMapping, `body_${idx}`, recipient, '')
          ),
        })),
      });
    }
  }

  if (body?.text) {
    const bodyKeys = extractPlaceholderIndices(body.text);
    if (bodyKeys.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyKeys.map((idx) => ({
          type: 'text',
          text: resolveMappingValue(variableMapping, `body_${idx}`, recipient),
        })),
      });
    }
  }

  buttons.forEach((button, index) => {
    if (button?.type !== 'URL' || !hasDynamicUrlPlaceholders(button.url || '')) return;
    const sample = String(button.urlExample || '').trim();
    components.push({
      type: 'button',
      sub_type: 'url',
      index,
      parameters: [{ type: 'text', text: sample || resolveLeadField(recipient, 'firstName') }],
    });
  });

  return components;
}

/** Gupshup `message` JSON for media-header templates (required on template/msg). */
function buildGupshupMessageEnvelope(template) {
  const header = template?.components?.header;
  const format = header?.format;
  if (!format || format === 'NONE' || format === 'TEXT') {
    return { type: 'text', text: '' };
  }

  const link = String(header?.mediaSampleUrl || '').trim();
  if (!link) return null;

  switch (format) {
    case 'IMAGE':
      return { type: 'image', image: { link } };
    case 'VIDEO':
      return { type: 'video', video: { link } };
    case 'DOCUMENT':
      return {
        type: 'document',
        document: { link, filename: 'document.pdf' },
      };
    default:
      return { type: 'text', text: '' };
  }
}

function expectedPlatformTemplateParamCount(template) {
  return buildGupshupParams(buildPlatformCampaignComponents(template, {}, {})).length;
}

function buildPlatformCampaignSendPayload(template, variableMapping, recipient) {
  const components = buildPlatformCampaignComponents(template, variableMapping, recipient);
  const params = buildGupshupParams(components);
  const message = buildGupshupMessageEnvelope(template);
  return { params, message, components };
}

module.exports = {
  buildPlatformCampaignComponents,
  buildGupshupMessageEnvelope,
  expectedPlatformTemplateParamCount,
  buildPlatformCampaignSendPayload,
  resolveLeadField,
};
