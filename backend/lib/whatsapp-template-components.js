/**
 * Shared helper for transforming a stored `WhatsAppTemplate` document into the
 * `components` array that Meta's Cloud API expects on `messages` send.
 *
 * Two builders are exported:
 *
 *   - buildComponentsFromMapping(template, mapping, recipient?)
 *       Used by the campaign runner. `mapping` is the campaign-side structured
 *       variable map ({ "1": { source: "client_name" }, ... }) that resolves
 *       per-recipient values via `resolveValue`.
 *
 *   - buildComponentsFromVariables(template, variables)
 *       Used by the inbox reply path. `variables` is a flat string map keyed by
 *       placeholder index (and "h<N>" for header placeholders) — exactly what
 *       the inbox composer collects from its variable inputs:
 *           {
 *             "1":  "Shubham",
 *             "2":  "tomorrow at 10:30",
 *             "h1": "Bali Salon"
 *           }
 *
 * Why a separate module:
 *   The campaign runner and the inbox both produce identical Meta payloads,
 *   but their input shapes differ (campaign mapping is structured; inbox is
 *   flat). Keeping the placeholder-extraction + payload-shape logic in one
 *   place prevents drift — when Meta extends the components shape (e.g. URL
 *   button placeholders, copy_code buttons), one fix lights up both paths.
 *
 * Placeholder syntax recognized: `{{1}}`, `{{2}}`, …
 *   - Header: indices stored as "h1", "h2", … (Meta only supports a single
 *     placeholder in TEXT headers but we don't enforce it here).
 *   - Body: indices stored as "1", "2", … (matching Meta's positional spec).
 */

'use strict';

const PLACEHOLDER_RE = /\{\{(\d+)\}\}/g;

/**
 * Returns the de-duplicated, ascending list of `{{N}}` indices found in a
 * template fragment of text.
 */
function extractPlaceholderIndices(text) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  let m;
  // Reset lastIndex per call — global regexes are stateful.
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    const idx = Number(m[1]);
    if (Number.isFinite(idx) && idx > 0) seen.add(idx);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Build the variable schema the inbox composer uses to render input fields.
 * Returns:
 *   {
 *     header: [{ key:"h1", label:"...", sample:"...", index:1 }],
 *     body:   [{ key:"1",  label:"...", sample:"...", index:1 }],
 *   }
 *
 * `template.variables` is the operator-set label map; `template.samples`
 * holds the example values shown to Meta during approval. We surface both
 * so the UI can show "Variable 1 (e.g. {sample})" hints.
 */
function describeTemplatePlaceholders(template) {
  const header = template?.components?.header;
  const body = template?.components?.body;
  const headerKeys =
    header && header.format === 'TEXT' && header.text
      ? extractPlaceholderIndices(header.text)
      : [];
  const bodyKeys = body?.text ? extractPlaceholderIndices(body.text) : [];

  function describe(prefix, idx) {
    const key = prefix === 'h' ? `h${idx}` : String(idx);
    /**
     * Only fall back to `variables[idx]` for body placeholders. Header and
     * body share the same `{{N}}` numbering in Meta but our local schema
     * keys them distinctly ("h1" vs "1"), so we must NOT cross-look-up or
     * a body label leaks into the header field.
     */
    const label =
      template?.variables?.[key]?.label ||
      (prefix === 'h' ? `Header var ${idx}` : `Variable ${idx}`);
    const sample =
      template?.samples?.[key] ||
      template?.variables?.[key]?.sampleValue ||
      '';
    return { key, label, sample, index: idx };
  }

  return {
    header: headerKeys.map((idx) => describe('h', idx)),
    body: bodyKeys.map((idx) => describe('b', idx)),
  };
}

/**
 * Inbox reply path — flat `variables` map.
 *
 * The map is permissive: missing keys collapse to empty strings so a
 * misconfigured template doesn't 500. Meta's API will reject empty
 * placeholders with a clear error message that bubbles up to the UI.
 */
function buildComponentsFromVariables(template, variables = {}) {
  const components = [];
  const header = template?.components?.header;
  const body = template?.components?.body;

  if (header && header.format === 'TEXT' && header.text) {
    const headerKeys = extractPlaceholderIndices(header.text);
    if (headerKeys.length > 0) {
      const params = headerKeys.map((idx) => ({
        type: 'text',
        text: String(variables[`h${idx}`] || variables[idx] || ''),
      }));
      components.push({ type: 'header', parameters: params });
    }
  }

  if (body?.text) {
    const bodyKeys = extractPlaceholderIndices(body.text);
    if (bodyKeys.length > 0) {
      const params = bodyKeys.map((idx) => ({
        type: 'text',
        text: String(variables[String(idx)] || variables[idx] || ''),
      }));
      components.push({ type: 'body', parameters: params });
    }
  }

  return components;
}

module.exports = {
  PLACEHOLDER_RE,
  extractPlaceholderIndices,
  describeTemplatePlaceholders,
  buildComponentsFromVariables,
};
