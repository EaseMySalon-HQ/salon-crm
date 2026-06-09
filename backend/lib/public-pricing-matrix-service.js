const { DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES } = require('./public-pricing-matrix-defaults');

const KNOWN_CELL_VALUES = new Set(['yes', 'no', 'addon', 'soon']);
const TIER_KEYS = ['starter', 'growth', 'pro'];

function normalizeCellValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeCategories(rawCategories) {
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    throw new Error('categories must be a non-empty array');
  }

  return rawCategories.map((cat, catIndex) => {
    const title = normalizeCellValue(cat?.title);
    if (!title) {
      throw new Error(`Category at index ${catIndex} requires a title`);
    }
    if (!Array.isArray(cat?.rows) || cat.rows.length === 0) {
      throw new Error(`Category "${title}" must include at least one row`);
    }

    const rows = cat.rows.map((row, rowIndex) => {
      const feature = normalizeCellValue(row?.feature);
      if (!feature) {
        throw new Error(`Row ${rowIndex + 1} in "${title}" requires a feature name`);
      }
      let hint = normalizeCellValue(row?.hint);
      if (hint === 'Based on client feedback') hint = '';
      const normalized = {
        feature,
        hint,
        starter: normalizeCellValue(row?.starter ?? row?.free),
        growth: normalizeCellValue(row?.growth),
        pro: normalizeCellValue(row?.pro),
      };
      for (const tier of TIER_KEYS) {
        if (!normalized[tier]) {
          throw new Error(`Row "${feature}" in "${title}" requires a value for ${tier}`);
        }
      }
      return normalized;
    });

    return { title, rows };
  });
}

function serializeMatrixDocument(doc) {
  const raw = doc?.categories?.length
    ? doc.categories
    : DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES;

  try {
    return {
      categories: normalizeCategories(raw),
      updatedAt: doc?.updatedAt,
      createdAt: doc?.createdAt,
    };
  } catch (error) {
    return {
      categories: normalizeCategories(DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES),
      updatedAt: doc?.updatedAt,
      createdAt: doc?.createdAt,
    };
  }
}

module.exports = {
  KNOWN_CELL_VALUES,
  TIER_KEYS,
  DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES,
  normalizeCategories,
  serializeMatrixDocument,
};
