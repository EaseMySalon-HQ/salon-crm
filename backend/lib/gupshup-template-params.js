/**
 * Convert Meta-style template `components` (used across the campaign runner and
 * inbox) into Gupshup's ordered `template.params` array.
 *
 * Gupshup addresses template variables positionally: params[0] fills {{1}},
 * params[1] fills {{2}}, etc. Meta groups parameters per component (header,
 * body, button). WhatsApp numbers variables header-first then body, so we
 * flatten in that order. Button URL/text params are excluded here — Gupshup
 * carries those via separate fields (`message`, `postbackTexts`).
 *
 * The param COUNT must exactly match the approved template or the send fails
 * (same class of bug as the old MSG91 variable-count mismatch), so this helper
 * is the single source of truth and is unit tested.
 */

'use strict';

const COMPONENT_ORDER = { header: 0, body: 1, button: 2 };

/** Extract the display text from a single Meta parameter object. */
function paramToText(param) {
  if (param == null) return '';
  if (typeof param === 'string' || typeof param === 'number') return String(param);
  switch (param.type) {
    case 'text':
      return String(param.text ?? '');
    case 'currency':
      return String(param.currency?.fallback_value ?? param.text ?? '');
    case 'date_time':
      return String(param.date_time?.fallback_value ?? param.text ?? '');
    default:
      return String(param.text ?? '');
  }
}

/**
 * @param {Array} components Meta-style components array
 * @returns {string[]} ordered params for Gupshup `template.params`
 */
function buildGupshupParams(components) {
  if (!Array.isArray(components)) return [];
  const ordered = [...components].sort(
    (a, b) => (COMPONENT_ORDER[a?.type] ?? 9) - (COMPONENT_ORDER[b?.type] ?? 9)
  );
  const params = [];
  for (const comp of ordered) {
    if (!comp || !Array.isArray(comp.parameters)) continue;
    for (const p of comp.parameters) {
      params.push(paramToText(p));
    }
  }
  return params;
}

module.exports = { buildGupshupParams, paramToText };
