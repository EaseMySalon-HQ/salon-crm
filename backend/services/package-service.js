/**
 * package-service.js
 * Pure business logic for the Packages feature.
 * No req/res here — all functions take plain arguments and return plain values.
 */

/**
 * Calculate expiry date from a purchase date and validity_days.
 * Returns null when validity_days is null (package never expires).
 *
 * @param {Date}        purchaseDate
 * @param {number|null} validityDays
 * @returns {Date|null}
 */
function calculateExpiryDate(purchaseDate, validityDays) {
  if (validityDays === null || validityDays === undefined) return null;
  const expiry = new Date(purchaseDate);
  expiry.setDate(expiry.getDate() + validityDays);
  return expiry;
}

/**
 * Validate that the number of services being redeemed meets the package minimum.
 *
 * @param {Array}  servicesRedeemed  - array of service objects/IDs being redeemed
 * @param {number} minServiceCount   - minimum required by the package
 * @returns {{ valid: boolean, message: string }}
 */
function validateMinServiceCount(servicesRedeemed, minServiceCount) {
  const count = Array.isArray(servicesRedeemed) ? servicesRedeemed.length : 0;
  if (count < minServiceCount) {
    return {
      valid: false,
      message: `Minimum ${minServiceCount} service(s) required per sitting. Only ${count} selected.`
    };
  }
  return { valid: true, message: '' };
}

/**
 * Check whether a package name already exists for this tenant.
 * Pass excludeId to skip the current document when editing.
 *
 * @param {string}      name
 * @param {ObjectId}    branchId
 * @param {Model}       PackageModel  - Mongoose model bound to the tenant DB
 * @param {string|null} excludeId     - package _id to exclude (for edit operations)
 * @returns {Promise<boolean>}        true = duplicate exists
 */
async function checkDuplicatePackageName(name, branchId, PackageModel, excludeId = null) {
  const query = {
    branchId,
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    status: { $ne: 'ARCHIVED' }
  };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await PackageModel.findOne(query).lean();
  return !!existing;
}

/**
 * Fetch the sum of individual service prices for a given list of service IDs.
 * Used to warn (not block) when package price is lower than sum of parts.
 *
 * @param {string[]} serviceIds
 * @param {Model}    ServiceModel - Mongoose model bound to the tenant DB
 * @returns {Promise<number>}
 */
async function calculateServicePriceSum(serviceIds, ServiceModel) {
  if (!serviceIds || serviceIds.length === 0) return 0;
  const services = await ServiceModel.find({
    _id: { $in: serviceIds }
  }).select('price').lean();
  return services.reduce((sum, s) => sum + (s.price || 0), 0);
}

/**
 * Build the services_redeemed sub-document array for a PackageRedemption.
 * Snapshots current service name + price so reports stay accurate even if
 * service data changes in the future.
 *
 * @param {string[]} serviceIds
 * @param {Model}    ServiceModel - Mongoose model bound to the tenant DB
 * @returns {Promise<Array<{ service_id, service_name, price }>>}
 */
async function buildRedemptionSnapshot(serviceIds, ServiceModel) {
  if (!serviceIds || serviceIds.length === 0) return [];
  const services = await ServiceModel.find({
    _id: { $in: serviceIds }
  }).select('name price').lean();

  return services.map(s => ({
    service_id: s._id,
    service_name: s.name,
    price: s.price || 0
  }));
}

/**
 * Determine payment_status from amount_paid vs total_price.
 *
 * @param {number} amountPaid
 * @param {number} totalPrice
 * @returns {'PAID'|'PARTIAL'|'PENDING'}
 */
function resolvePaymentStatus(amountPaid, totalPrice) {
  if (amountPaid >= totalPrice) return 'PAID';
  if (amountPaid > 0) return 'PARTIAL';
  return 'PENDING';
}

module.exports = {
  calculateExpiryDate,
  validateMinServiceCount,
  checkDuplicatePackageName,
  calculateServicePriceSum,
  buildRedemptionSnapshot,
  resolvePaymentStatus
};
