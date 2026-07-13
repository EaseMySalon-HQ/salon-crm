'use strict';

/**
 * Shared public-website fields for catalog entities (Service, Product, Package, etc.).
 */
function websiteCatalogFields(mongoose, { isPublicDefault = false } = {}) {
  return {
    isPublic: { type: Boolean, default: isPublicDefault },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    slug: { type: String, trim: true, lowercase: true, default: '' },
    shortDescription: { type: String, default: '', maxlength: 500 },
    seoTitle: { type: String, default: '', maxlength: 120 },
    seoDescription: { type: String, default: '', maxlength: 320 },
    imageAlt: { type: String, default: '' },
  };
}

module.exports = { websiteCatalogFields };
