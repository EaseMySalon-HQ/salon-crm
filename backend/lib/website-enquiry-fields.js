'use strict';

const FIELD_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'number', 'date', 'select']);

function slugifyFieldKey(label, fallback = 'field') {
  const base = String(label || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || fallback;
}

function normalizeCustomFieldConfig(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const label = String(raw.label || '').trim().slice(0, 80);
  if (!label) return null;
  const type = FIELD_TYPES.has(raw.type) ? raw.type : 'text';
  let key = String(raw.key || '').trim().toLowerCase();
  if (!key || !/^[a-z][a-z0-9_]{0,39}$/.test(key)) {
    key = slugifyFieldKey(label, `field_${index + 1}`);
  }
  const options =
    type === 'select'
      ? (Array.isArray(raw.options) ? raw.options : [])
          .map((o) => String(o || '').trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];
  if (type === 'select' && !options.length) return null;
  return {
    key,
    label,
    type,
    required: Boolean(raw.required),
    placeholder: String(raw.placeholder || '').trim().slice(0, 120),
    options,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
  };
}

function normalizeCustomFieldList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const usedKeys = new Set();
  for (let i = 0; i < list.length && out.length < 10; i += 1) {
    const field = normalizeCustomFieldConfig(list[i], i);
    if (!field) continue;
    let key = field.key;
    let n = 2;
    while (usedKeys.has(key)) {
      key = `${field.key}_${n}`;
      n += 1;
    }
    field.key = key;
    usedKeys.add(key);
    out.push(field);
  }
  return out.sort((a, b) => a.order - b.order);
}

function publicCustomFields(list) {
  return normalizeCustomFieldList(list).map(({ key, label, type, required, placeholder, options }) => ({
    key,
    label,
    type,
    required,
    placeholder,
    options,
  }));
}

function validateSubmittedCustomFields(configFields, submitted) {
  const fields = normalizeCustomFieldList(configFields);
  const raw = submitted && typeof submitted === 'object' ? submitted : {};
  const out = {};
  for (const field of fields) {
    const val = raw[field.key];
    const str = val == null ? '' : String(val).trim();
    if (field.required && !str) {
      const err = new Error(`${field.label} is required`);
      err.code = 'CUSTOM_FIELD_REQUIRED';
      throw err;
    }
    if (!str) continue;
    if (str.length > 500) {
      const err = new Error(`${field.label} is too long`);
      err.code = 'CUSTOM_FIELD_INVALID';
      throw err;
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      const err = new Error(`${field.label} must be a valid email`);
      err.code = 'CUSTOM_FIELD_INVALID';
      throw err;
    }
    if (field.type === 'select' && !field.options.includes(str)) {
      const err = new Error(`${field.label} has an invalid option`);
      err.code = 'CUSTOM_FIELD_INVALID';
      throw err;
    }
    out[field.key] = str;
  }
  return out;
}

function formatCustomFieldsForNotes(customFields, configFields) {
  const byKey = new Map(normalizeCustomFieldList(configFields).map((f) => [f.key, f.label]));
  return Object.entries(customFields || {})
    .map(([key, value]) => {
      const label = byKey.get(key) || key;
      return `${label}: ${value}`;
    })
    .join('\n');
}

module.exports = {
  FIELD_TYPES,
  normalizeCustomFieldList,
  publicCustomFields,
  validateSubmittedCustomFields,
  formatCustomFieldsForNotes,
  slugifyFieldKey,
};
