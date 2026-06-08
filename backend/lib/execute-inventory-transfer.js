/**
 * Execute an approved inventory transfer across two tenant DBs.
 * Validates source stock; creates destination product from source when missing.
 * Rolls back source on destination failure.
 */

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { catalogKey } = require('./branch-management-helpers');

async function findProductByKey(Product, productKey) {
  const keyLower = String(productKey).toLowerCase();
  const all = await Product.find({ isActive: true }).select('name sku stock').lean();
  return all.find((p) => catalogKey(p.name, p.sku) === keyLower) || null;
}

async function findFullProductByKey(Product, productKey) {
  const keyLower = String(productKey).toLowerCase();
  const all = await Product.find({ isActive: true }).lean();
  return all.find((p) => catalogKey(p.name, p.sku) === keyLower) || null;
}

function transferReferenceNumber(transfer) {
  const id = String(transfer._id || '');
  return `TRF-${id.slice(-8).toUpperCase()}`;
}

function unitCostForProduct(product) {
  if (product.cost != null && product.cost > 0) return product.cost;
  if (product.price != null && product.price > 0) return product.price;
  return 0;
}

function buildInventoryTxn({
  productId,
  productName,
  quantity,
  previousStock,
  newStock,
  unitCost,
  transfer,
  notes,
  processedBy,
}) {
  const qtyAbs = Math.abs(Number(quantity) || 0);
  const cost = Number(unitCost) || 0;
  return {
    productId,
    productName,
    transactionType: 'transfer',
    quantity,
    previousStock,
    newStock,
    unitCost: cost,
    totalValue: cost * qtyAbs,
    referenceType: 'transfer',
    referenceId: String(transfer._id),
    referenceNumber: transferReferenceNumber(transfer),
    processedBy: processedBy || 'System',
    location: 'main',
    reason: 'Branch transfer',
    notes: notes || '',
    transactionDate: new Date(),
  };
}

async function createDestinationProductFromSource({ toModels, fromProductDoc, transfer, toBranchId }) {
  const isServiceProduct = fromProductDoc.productType === 'service';
  const name = String(transfer.productName || fromProductDoc.name || '').trim();
  if (!name) {
    throw new Error('Product name is required to create destination product');
  }

  const payload = {
    name,
    category: fromProductDoc.category || 'General',
    price: isServiceProduct
      ? (fromProductDoc.cost ?? fromProductDoc.price ?? 0)
      : (fromProductDoc.price ?? 0),
    stock: 0,
    minimumStock: fromProductDoc.minimumStock ?? 5,
    barcode: fromProductDoc.barcode || '',
    hsnSacCode: fromProductDoc.hsnSacCode || '',
    supplier: fromProductDoc.supplier || '',
    description: fromProductDoc.description || '',
    imageUrl: fromProductDoc.imageUrl || '',
    taxCategory: fromProductDoc.taxCategory || 'standard',
    productType: fromProductDoc.productType || 'retail',
    isActive: true,
    branchId: toBranchId,
  };

  if (fromProductDoc.cost != null) payload.cost = fromProductDoc.cost;
  if (fromProductDoc.offerPrice != null) payload.offerPrice = fromProductDoc.offerPrice;
  if (fromProductDoc.baseUnit) payload.baseUnit = fromProductDoc.baseUnit;
  if (fromProductDoc.volume != null) payload.volume = fromProductDoc.volume;
  if (fromProductDoc.volumeUnit) payload.volumeUnit = fromProductDoc.volumeUnit;
  if (fromProductDoc.allowFractionalConsumption != null) {
    payload.allowFractionalConsumption = fromProductDoc.allowFractionalConsumption;
  }

  const sku = String(transfer.sku || fromProductDoc.sku || '').trim();
  if (sku) payload.sku = sku;

  try {
    return await toModels.Product.create(payload);
  } catch (err) {
    if (err?.code === 11000 && sku) {
      const existing = await findFullProductByKey(toModels.Product, transfer.productKey);
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * @param {{ mainConnection: import('mongoose').Connection, transfer: object, branchList: object[], processedBy?: string }}
 * @returns {Promise<{ ok: boolean, errors: string[], createdDestinationProduct?: boolean }>}
 */
async function executeInventoryTransfer({ mainConnection, transfer, branchList, processedBy }) {
  const errors = [];
  const fromBranch = branchList.find((b) => String(b.id) === String(transfer.fromBranchId));
  const toBranch = branchList.find((b) => String(b.id) === String(transfer.toBranchId));

  if (!fromBranch || !toBranch) {
    return { ok: false, errors: ['Branch not found'] };
  }

  if (String(transfer.fromBranchId) === String(transfer.toBranchId)) {
    return { ok: false, errors: ['Source and destination branch must differ'] };
  }

  const qty = Number(transfer.quantity) || 0;
  if (qty < 1) {
    return { ok: false, errors: ['Invalid quantity'] };
  }

  try {
    const fromConn = await databaseManager.getConnection(fromBranch.code, mainConnection);
    const toConn = await databaseManager.getConnection(toBranch.code, mainConnection);
    const fromModels = modelFactory.createBusinessModels(fromConn);
    const toModels = modelFactory.createBusinessModels(toConn);

    const fromProduct = await findFullProductByKey(fromModels.Product, transfer.productKey);
    if (!fromProduct) {
      return { ok: false, errors: ['Source product not found at sending branch'] };
    }

    const prevFrom = fromProduct.stock || 0;
    if (prevFrom < qty) {
      return { ok: false, errors: ['Insufficient stock at source branch'] };
    }

    let toProduct = await findFullProductByKey(toModels.Product, transfer.productKey);
    let createdDestinationProduct = false;

    if (!toProduct) {
      toProduct = await createDestinationProductFromSource({
        toModels,
        fromProductDoc: fromProduct,
        transfer,
        toBranchId: toBranch.id,
      });
      createdDestinationProduct = true;
    }

    const newFrom = prevFrom - qty;
    const prevTo = toProduct.stock || 0;
    const newTo = prevTo + qty;
    const unitCost = unitCostForProduct(fromProduct);

    await fromModels.Product.updateOne({ _id: fromProduct._id }, { $set: { stock: newFrom } });
    await fromModels.InventoryTransaction.create(
      buildInventoryTxn({
        productId: fromProduct._id,
        productName: fromProduct.name,
        quantity: -qty,
        previousStock: prevFrom,
        newStock: newFrom,
        unitCost,
        transfer,
        notes: `Transfer to ${toBranch.name}`,
        processedBy,
      })
    );

    try {
      await toModels.Product.updateOne({ _id: toProduct._id }, { $set: { stock: newTo } });
      await toModels.InventoryTransaction.create(
        buildInventoryTxn({
          productId: toProduct._id,
          productName: toProduct.name,
          quantity: qty,
          previousStock: prevTo,
          newStock: newTo,
          unitCost,
          transfer,
          notes: createdDestinationProduct
            ? `Transfer from ${fromBranch.name} (product auto-created)`
            : `Transfer from ${fromBranch.name}`,
          processedBy,
        })
      );
    } catch (destErr) {
      await fromModels.Product.updateOne({ _id: fromProduct._id }, { $set: { stock: prevFrom } });
      await fromModels.InventoryTransaction.create({
        ...buildInventoryTxn({
          productId: fromProduct._id,
          productName: fromProduct.name,
          quantity: qty,
          previousStock: newFrom,
          newStock: prevFrom,
          unitCost,
          transfer,
          notes: `Rollback failed transfer to ${toBranch.name}: ${destErr.message}`,
          processedBy,
        }),
        transactionType: 'adjustment',
        referenceType: 'adjustment',
        reason: 'Transfer rollback',
      });
      if (createdDestinationProduct) {
        try {
          await toModels.Product.deleteOne({ _id: toProduct._id, stock: 0 });
        } catch {
          /* best-effort cleanup */
        }
      }
      throw destErr;
    }

    return { ok: true, errors: [], createdDestinationProduct };
  } catch (err) {
    errors.push(err.message || 'Transfer execution failed');
    return { ok: false, errors };
  }
}

module.exports = {
  executeInventoryTransfer,
  findProductByKey,
  findFullProductByKey,
  createDestinationProductFromSource,
  buildInventoryTxn,
};
