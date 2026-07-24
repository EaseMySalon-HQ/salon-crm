const { checkAndSendLowInventoryAlerts } = require('../utils/low-inventory-checker');
const { logger } = require('../utils/logger');

const UNIT_ENUM = ['g', 'ml', 'pcs'];

/**
 * Get primary staff id from a sale item (first contribution or legacy staffId).
 * @param {Object} item - Sale item with staffContributions or staffId
 * @returns {string}
 */
function getPrimaryStaffId(item) {
  if (item.staffContributions && item.staffContributions.length > 0) {
    return String(item.staffContributions[0].staffId || '');
  }
  return String(item.staffId || '');
}

/**
 * Normalize status to lowercase for comparison.
 * @param {string} status
 * @returns {string}
 */
function normalizeStatus(status) {
  if (!status) return '';
  return String(status).toLowerCase();
}

const MANUAL_CONSUMPTION_STATUSES = new Set(['completed', 'partial', 'unpaid']);

function isManualConsumptionStatus(status) {
  return MANUAL_CONSUMPTION_STATUSES.has(normalizeStatus(status));
}

/**
 * Resolve consumption rules for a service line (variant-aware, deduped by product).
 * @param {Object} item - Sale item with serviceId, variantKey
 * @param {mongoose.Types.ObjectId|string} branchId
 * @param {Object} ServiceConsumptionRule - Mongoose model
 * @returns {Promise<Object[]>}
 */
async function resolveRulesForServiceItem(item, branchId, ServiceConsumptionRule) {
  const variantKey = (item.variantKey || '').trim();
  const allRules = await ServiceConsumptionRule.find({ serviceId: item.serviceId, branchId }).lean();
  const rules = variantKey
    ? allRules.filter((r) => (r.variantKey || '') === variantKey || (r.variantKey || '') === '')
    : allRules.filter((r) => !(r.variantKey || '').trim());
  if (rules.length === 0 && allRules.length > 0 && variantKey) {
    rules.push(...allRules.filter((r) => !(r.variantKey || '').trim()));
  } else if (rules.length === 0) {
    rules.push(...allRules);
  }
  const seenProduct = new Set();
  const rulesDeduped = rules.filter((r) => {
    const key = String(r.productId);
    if (seenProduct.has(key)) return false;
    seenProduct.add(key);
    return true;
  });
  return rulesDeduped.length ? rulesDeduped : rules;
}

/**
 * Run auto consumption for a single service line item.
 * Deducts stock per ServiceConsumptionRule and creates InventoryConsumptionLog per product.
 * @param {Object} sale - Sale document (with _id, billNo, branchId, items)
 * @param {number} itemIndex - Index of the service item in sale.items
 * @param {Object} businessModels - Product, Service, ServiceConsumptionRule, InventoryConsumptionLog
 * @param {Object} options - { adjustments: { productId: { quantity, reason } } } optional
 * @returns {{ warnings: string[], processed: boolean }}
 */
async function runConsumptionForServiceItem(sale, itemIndex, businessModels, options = {}) {
  const { Product, Service, ServiceConsumptionRule, InventoryConsumptionLog, InventoryTransaction } = businessModels;
  const item = sale.items[itemIndex];
  const warnings = [];

  if (!item || item.type !== 'service' || !item.serviceId) {
    return { warnings, processed: false };
  }

  const service = await Service.findById(item.serviceId).lean();
  if (!service || !service.isAutoConsumptionEnabled) {
    return { warnings, processed: false };
  }

  const branchIdForRules = sale.branchId || (options.user && options.user.branchId);
  const rulesFinal = await resolveRulesForServiceItem(item, branchIdForRules, ServiceConsumptionRule);
  if (rulesFinal.length === 0) {
    logger.debug('[AutoConsumption] No consumption rules for serviceId:', item.serviceId, 'branchId:', String(branchIdForRules));
    return { warnings, processed: true };
  }

  const staffId = getPrimaryStaffId(item);
  const branchId = sale.branchId || (options.user && options.user.branchId);
  const billId = sale._id;
  const serviceId = item.serviceId;
  const itemQty = Number(item.quantity) || 1;
  const adjustments = options.adjustments || {};

  for (const rule of rulesFinal) {
    try {
      const product = await Product.findById(rule.productId);
      if (!product) {
        warnings.push(`Product not found for rule (productId: ${rule.productId}); skipped.`);
        continue;
      }
      if (product.branchId && String(product.branchId) !== String(branchId)) {
        warnings.push(`Product ${product.name} belongs to another branch; skipped.`);
        continue;
      }
      // Use same unit source as products directory & consumption rules (volumeUnit || baseUnit)
      const productUnit = (product.volumeUnit || product.baseUnit || 'pcs').toLowerCase();
      const ruleUnit = (rule.unit || 'pcs').toLowerCase();
      if (productUnit !== ruleUnit) {
        warnings.push(`Unit mismatch for product ${product.name}: rule has ${rule.unit}, product has ${product.volumeUnit || product.baseUnit || 'pcs'}; skipped.`);
        continue;
      }

      let quantityToDeduct = (Number(rule.quantityUsed) || 0) * itemQty;
      const adj = adjustments[String(rule.productId)];
      if (rule.isAdjustable && adj && typeof adj.quantity === 'number') {
        const maxPct = (Number(rule.maxAdjustmentPercent) || 20) / 100;
        const baseQty = (Number(rule.quantityUsed) || 0) * itemQty;
        const minQty = baseQty * (1 - maxPct);
        const maxQty = baseQty * (1 + maxPct);
        quantityToDeduct = Math.max(minQty, Math.min(maxQty, adj.quantity));
      }

      if (quantityToDeduct <= 0) continue;

      const stockBefore = Number(product.stock);
      // When product has volume (e.g. 1000 ml per unit), stock is in "units"; convert consumption to units
      const productVol = Number(product.volume);
      const useVolumeUnits = productVol > 0 && productUnit === ruleUnit;
      const stockDelta = useVolumeUnits ? quantityToDeduct / productVol : quantityToDeduct;
      const stockAfter = stockBefore - stockDelta;

      logger.debug('[AutoConsumption] Deducting', { product: product.name, quantityToDeduct, productVol, useVolumeUnits, stockDelta, stockBefore, stockAfter });
      await Product.findByIdAndUpdate(rule.productId, { stock: stockAfter });

      const logPayload = {
        productId: rule.productId,
        serviceId,
        billId,
        staffId,
        quantityConsumed: quantityToDeduct,
        stockBefore,
        stockAfter,
        isReversal: false,
        referenceLogId: null,
        itemIndex,
        branchId
      };
      if (rule.isAdjustable && adj && (adj.quantity !== quantityToDeduct || adj.reason)) {
        logPayload.adjustedQuantity = quantityToDeduct;
        logPayload.adjustmentReason = (adj.reason || '').trim();
      }
      await InventoryConsumptionLog.create(logPayload);

      const staffName = (item.staffContributions && item.staffContributions[0] && item.staffContributions[0].staffName) || item.staffName || options.user?.firstName || options.user?.name || 'System';
      const billNo = sale.billNo || (sale._id ? `Bill-${String(sale._id).slice(-6)}` : 'N/A');
      const unitCost = Number(product.cost) || Number(product.price) || 0;
      if (InventoryTransaction) {
        await InventoryTransaction.create({
          productId: rule.productId,
          productName: product.name,
          transactionType: 'service_usage',
          quantity: -Math.abs(stockDelta),
          previousStock: stockBefore,
          newStock: stockAfter,
          unitCost,
          totalValue: Math.abs(stockDelta * unitCost),
          referenceType: 'other',
          referenceId: String(billId),
          referenceNumber: billNo,
          processedBy: staffName,
          reason: 'Service consumption (auto)',
          notes: `Consumed by service (${quantityToDeduct} ${ruleUnit})`,
          transactionDate: new Date()
        });
      }

      try {
        await checkAndSendLowInventoryAlerts(String(branchId), String(rule.productId));
      } catch (alertErr) {
        logger.warn('Auto consumption: low inventory alert check failed:', alertErr.message);
      }
    } catch (err) {
      logger.error('Auto consumption: error processing rule for product', rule.productId, err);
      warnings.push(`Failed to deduct product (${rule.productId}): ${err.message}`);
    }
  }

  return { warnings, processed: true };
}

/**
 * Run auto consumption for all eligible service lines on a completed sale.
 * Sets autoConsumptionProcessedAt on each processed item and saves the sale.
 * @param {Object} sale - Sale document (will be mutated and saved)
 * @param {Object} businessModels - Product, Service, ServiceConsumptionRule, InventoryConsumptionLog, Sale
 * @param {Object} options - { user, adjustmentsByItemIndex: { 0: { productId: { quantity, reason } } } }
 * @returns {{ warnings: string[], processedCount: number }}
 */
async function runAutoConsumptionForSale(sale, businessModels, options = {}) {
  const { Sale } = businessModels;
  const status = normalizeStatus(sale.status);
  const allWarnings = [];
  let processedCount = 0;

  const branchId = sale.branchId || (options.user && options.user.branchId);
  if (!branchId) {
    logger.warn('[AutoConsumption] No branchId on sale and no user.branchId in options; skipping.');
    return { warnings: allWarnings, processedCount: 0 };
  }
  if (status !== 'completed') {
    logger.debug('[AutoConsumption] Sale status is not completed:', status, 'billNo:', sale.billNo);
    return { warnings: allWarnings, processedCount: 0 };
  }

  const adjustmentsByItemIndex = options.adjustmentsByItemIndex || {};
  const items = sale.items || [];
  logger.debug('[AutoConsumption] Running for sale', sale.billNo || sale._id, 'items:', items.length, 'branchId:', String(branchId));
  const processedIndices = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type !== 'service' || !item.serviceId || item.autoConsumptionProcessedAt) {
      if (item.type === 'service' && item.serviceId) {
        logger.debug('[AutoConsumption] Skip item', i, 'already processed:', !!item.autoConsumptionProcessedAt);
      }
      continue;
    }
    const adj = adjustmentsByItemIndex[i] || {};
    const saleForItem = { ...(sale.toObject ? sale.toObject() : sale), branchId: sale.branchId || branchId };
    const { warnings, processed } = await runConsumptionForServiceItem(saleForItem, i, businessModels, { adjustments: adj, user: options.user });
    if (warnings.length) logger.warn('[AutoConsumption] Item', i, 'warnings:', warnings);
    allWarnings.push(...warnings);
    if (processed) {
      processedCount++;
      processedIndices.push(i);
    }
  }

  if (processedIndices.length > 0) {
    const updatedItems = items.map((item, idx) => {
      if (processedIndices.includes(idx)) {
        return { ...item.toObject ? item.toObject() : item, autoConsumptionProcessedAt: new Date() };
      }
      return item.toObject ? item.toObject() : item;
    });
    sale.items = updatedItems;
    sale.markModified('items');
    await sale.save();
  }

  return { warnings: allWarnings, processedCount };
}

/**
 * Deduct stock for one ad-hoc manual consumption line (no service rules required).
 * @param {{ productId: string, quantity: number, notes?: string }} entry
 * @param {Object} businessModels
 * @param {Object} options - { branchId, user, billId?, billNo?, serviceId?, itemIndex?, source }
 */
async function recordAdHocConsumptionEntry(entry, businessModels, options = {}) {
  const { Product, InventoryConsumptionLog, InventoryTransaction } = businessModels;
  const warnings = [];
  const branchId = options.branchId;
  const productId = entry?.productId;
  const quantityToDeduct = Number(entry?.quantity);

  if (!productId) {
    return { ok: false, warnings: ['Product is required.'] };
  }
  if (!Number.isFinite(quantityToDeduct) || quantityToDeduct <= 0) {
    return { ok: false, warnings: ['Quantity must be greater than zero.'] };
  }
  if (!branchId) {
    return { ok: false, warnings: ['Branch is required.'] };
  }

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return { ok: false, warnings: ['Product not found.'] };
    }
    if (product.branchId && String(product.branchId) !== String(branchId)) {
      return { ok: false, warnings: [`${product.name} belongs to another branch.`] };
    }

    const productUnit = (product.volumeUnit || product.baseUnit || 'pcs').toLowerCase();
    const productVol = Number(product.volume);
    const useVolumeUnits = productVol > 0 && productUnit !== 'pcs' && productUnit !== 'pkt';
    const stockBefore = Number(product.stock);
    const stockDelta = useVolumeUnits ? quantityToDeduct / productVol : quantityToDeduct;
    const stockAfter = stockBefore - stockDelta;

    await Product.findByIdAndUpdate(productId, { stock: stockAfter });

    const staffId = String(options.staffId || options.user?.staffId || options.user?._id || '');
    const staffName = options.staffName || options.user?.firstName || options.user?.name || options.user?.email || 'Staff';
    const source = options.source || (options.billId ? 'manual_bill' : 'manual_bulk');

    await InventoryConsumptionLog.create({
      productId,
      serviceId: options.serviceId || null,
      billId: options.billId || null,
      staffId,
      quantityConsumed: quantityToDeduct,
      stockBefore,
      stockAfter,
      isReversal: false,
      referenceLogId: null,
      itemIndex: options.itemIndex,
      branchId,
      source,
      adjustmentReason: (entry.notes || options.notes || '').trim(),
    });

    const unitCost = Number(product.cost) || Number(product.price) || 0;
    if (InventoryTransaction) {
      const billNo = options.billNo || (options.billId ? `Bill-${String(options.billId).slice(-6)}` : '');
      await InventoryTransaction.create({
        productId,
        productName: product.name,
        transactionType: 'service_usage',
        quantity: -Math.abs(stockDelta),
        previousStock: stockBefore,
        newStock: stockAfter,
        unitCost,
        totalValue: Math.abs(stockDelta * unitCost),
        referenceType: options.billId ? 'other' : 'adjustment',
        referenceId: options.billId ? String(options.billId) : String(productId),
        referenceNumber: billNo || `MC-${Date.now()}`,
        processedBy: staffName,
        reason: source === 'manual_bill' ? 'Service consumption (manual bill)' : 'Service consumption (manual)',
        notes: entry.notes || options.notes || `Manual consumption (${quantityToDeduct} ${productUnit})`,
        transactionDate: new Date(),
      });
    }

    try {
      await checkAndSendLowInventoryAlerts(String(branchId), String(productId));
    } catch (alertErr) {
      logger.warn('Manual consumption: low inventory alert check failed:', alertErr.message);
    }

    return { ok: true, warnings, productName: product.name, quantity: quantityToDeduct, unit: productUnit };
  } catch (err) {
    logger.error('Manual consumption entry failed:', productId, err);
    return { ok: false, warnings: [err.message || 'Failed to record consumption.'] };
  }
}

/**
 * Record multiple ad-hoc manual consumption lines.
 * @param {Array<{ productId: string, quantity: number, notes?: string }>} entries
 * @param {Object} businessModels
 * @param {Object} options - { branchId, user, billId?, billNo?, source? }
 */
async function recordAdHocManualConsumption(entries, businessModels, options = {}) {
  const allWarnings = [];
  let recordedCount = 0;

  if (!Array.isArray(entries) || entries.length === 0) {
    return { warnings: ['Add at least one product and quantity.'], recordedCount: 0 };
  }

  const branchId = options.branchId || (options.user && options.user.branchId);
  if (!branchId) {
    return { warnings: ['Branch is required to record consumption.'], recordedCount: 0 };
  }

  for (const entry of entries) {
    const result = await recordAdHocConsumptionEntry(entry, businessModels, { ...options, branchId });
    if (result.warnings?.length) allWarnings.push(...result.warnings);
    if (result.ok) recordedCount++;
  }

  return { warnings: allWarnings, recordedCount };
}

/**
 * Reverse all consumption logs for a bill (e.g. when status changes to cancelled).
 * Creates reversal logs, restores product stock, clears autoConsumptionProcessedAt on sale items.
 * @param {mongoose.Types.ObjectId|string} saleId - Sale _id
 * @param {Object} businessModels - Product, Sale, InventoryConsumptionLog
 */
async function reverseConsumptionForBill(saleId, businessModels) {
  const { Product, Sale, InventoryConsumptionLog } = businessModels;
  const id = typeof saleId === 'string' ? saleId : (saleId ? saleId.toString() : null);
  if (!id) return;

  const logs = await InventoryConsumptionLog.find({ billId: id, isReversal: false }).sort({ createdAt: 1 }).lean();
  if (logs.length === 0) return;

  for (const log of logs) {
    try {
      const product = await Product.findById(log.productId);
      if (!product) {
        logger.warn(`Auto consumption reversal: product ${log.productId} not found; skipping log ${log._id}`);
        continue;
      }
      const currentStock = Number(product.stock);
      const productVol = Number(product.volume);
      const productUnit = (product.volumeUnit || product.baseUnit || 'pcs').toLowerCase();
      const useVolumeUnits = productVol > 0 && productUnit;
      const unitsToRestore = useVolumeUnits ? log.quantityConsumed / productVol : log.quantityConsumed;
      const stockAfter = currentStock + unitsToRestore;

      await Product.findByIdAndUpdate(log.productId, { stock: stockAfter });

      await InventoryConsumptionLog.create({
        productId: log.productId,
        serviceId: log.serviceId,
        billId: log.billId,
        staffId: log.staffId,
        quantityConsumed: -log.quantityConsumed,
        stockBefore: currentStock,
        stockAfter,
        isReversal: true,
        referenceLogId: log._id,
        itemIndex: log.itemIndex,
        branchId: log.branchId
      });
    } catch (err) {
      logger.error('Auto consumption reversal: error for log', log._id, err);
    }
  }

  const sale = await Sale.findById(id);
  if (sale && sale.items && sale.items.length > 0) {
    const updatedItems = sale.items.map((item) => {
      const plain = item.toObject ? item.toObject() : item;
      return { ...plain, autoConsumptionProcessedAt: undefined };
    });
    sale.items = updatedItems;
    sale.markModified('items');
    await sale.save();
  }
}

module.exports = {
  runAutoConsumptionForSale,
  recordAdHocManualConsumption,
  recordAdHocConsumptionEntry,
  reverseConsumptionForBill,
  runConsumptionForServiceItem,
  resolveRulesForServiceItem,
  getPrimaryStaffId,
  normalizeStatus,
  isManualConsumptionStatus,
  UNIT_ENUM
};
