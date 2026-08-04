'use strict';

const { hasDynamicUrlPlaceholders } = require('./gupshup-template-apply-fields');

function suggestUrlExample(url) {
  return String(url || '').replace(/\{\{\d+\}\}/g, 'sample');
}

/** Dynamic URL buttons that still need a sample URL for Meta/Gupshup submit. */
function missingDynamicUrlExamples(components) {
  const buttons = components?.buttons;
  if (!Array.isArray(buttons)) return [];
  const missing = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const btn = buttons[index];
    if (btn?.type !== 'URL') continue;
    const url = String(btn.url || '');
    if (!hasDynamicUrlPlaceholders(url)) continue;
    if (String(btn.urlExample || '').trim()) continue;
    missing.push({
      index,
      text: btn.text || '',
      url,
      suggestedExample: suggestUrlExample(url),
    });
  }
  return missing;
}

/** Merge { "0": "https://...", "1": "..." } onto template button rows (mutates `components`). */
function applyButtonUrlExamples(components, urlExamples) {
  if (!components || !urlExamples || typeof urlExamples !== 'object') return components;
  const buttons = components.buttons;
  if (!Array.isArray(buttons)) return components;
  for (const [idxStr, example] of Object.entries(urlExamples)) {
    const idx = parseInt(idxStr, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= buttons.length) continue;
    const ex = String(example || '').trim();
    if (!ex) continue;
    if (buttons[idx]?.type === 'URL') buttons[idx].urlExample = ex;
  }
  return components;
}

module.exports = {
  suggestUrlExample,
  missingDynamicUrlExamples,
  applyButtonUrlExamples,
};
