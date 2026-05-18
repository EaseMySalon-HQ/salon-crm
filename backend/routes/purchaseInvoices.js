const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken, requireStaff } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken, setupBusinessDatabase, requireStaff);

async function allocateInvoiceNumber(models, branchId) {
  const { BusinessSettings, PurchaseInvoice } = models;
  let settings = await BusinessSettings.findOne({ branchId });
  if (!settings) {
    settings = new BusinessSettings({
      branchId,
      purchaseOrderNumber: 0,
      purchaseInvoiceNumber: 0
    });
    await settings.save();
  }
  if (settings.purchaseInvoiceNumber == null) {
    await BusinessSettings.findByIdAndUpdate(settings._id, { purchaseInvoiceNumber: 0 });
    settings.purchaseInvoiceNumber = 0;
  }
  const updated = await BusinessSettings.findOneAndUpdate(
    { _id: settings._id },
    { $inc: { purchaseInvoiceNumber: 1 } },
    { new: true }
  );
  let num = updated.purchaseInvoiceNumber;
  let inv = `PI-${num.toString().padStart(6, '0')}`;
  for (let i = 0; i < 500; i++) {
    const exists = await PurchaseInvoice.findOne({ branchId, invoiceNumber: inv });
    if (!exists) break;
    num += 1;
    inv = `PI-${num.toString().padStart(6, '0')}`;
    await BusinessSettings.findByIdAndUpdate(settings._id, { purchaseInvoiceNumber: num });
  }
  return inv;
}

/** IST calendar day from `<input type="date">`; stored as midday IST so lists/filters remain stable. */
function parsePurchaseInvoiceCalendarDate(raw) {
  if (raw == null || raw === '') return new Date();
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[^\d]|$)/.exec(s);
  if (m) {
    const y = m[1];
    const mo = m[2];
    const d = m[3];
    return new Date(`${y}-${mo}-${d}T12:00:00+05:30`);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return new Date();
}

function computeTotalsFromLines(lines) {
  let subtotal = 0;
  let gstTotal = 0;
  let discountTotal = 0;
  for (const line of lines) {
    const qty = parseFloat(line.receivedQty) || 0;
    const price = parseFloat(line.purchasePrice) || 0;
    const ld = parseFloat(line.lineDiscount) || 0;
    discountTotal += ld;
    const base = Math.max(0, qty * price - ld);
    const gst = (base * (parseFloat(line.gstRate) || 0)) / 100;
    subtotal += base;
    gstTotal += gst;
  }
  const grandTotal = Math.round((subtotal + gstTotal) * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gstTotal: Math.round(gstTotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    grandTotal
  };
}

function syncPaymentFields(inv, body) {
  const grand = inv.grandTotal || 0;
  let paid = body.paidAmount != null ? parseFloat(body.paidAmount) : inv.paidAmount;
  if (Number.isNaN(paid)) paid = 0;
  paid = Math.max(0, Math.min(paid, grand));
  inv.paidAmount = Math.round(paid * 100) / 100;
  inv.dueAmount = Math.round((grand - inv.paidAmount) * 100) / 100;
  if (body.paymentStatus && ['paid', 'unpaid', 'partially_paid'].includes(body.paymentStatus)) {
    inv.paymentStatus = body.paymentStatus;
  } else {
    if (inv.paidAmount <= 0) inv.paymentStatus = 'unpaid';
    else if (inv.paidAmount >= grand - 0.005) inv.paymentStatus = 'paid';
    else inv.paymentStatus = 'partially_paid';
  }
}

/**
 * Purchase orders fulfilled only via book-only GRNs (recordedInventory: false) remain partially_received until
 * a posted purchase invoice exists. Legacy GRNs that bumped stock are left unchanged here.
 */
async function reconcileLinkedPurchaseOrderStatus(models, branchId, purchaseOrderId) {
  if (!purchaseOrderId) return;
  const { PurchaseOrder, PurchaseInvoice } = models;
  const po = await PurchaseOrder.findById(purchaseOrderId);
  if (!po || po.branchId.toString() !== branchId.toString()) return;
  if (po.status === 'cancelled') return;
  if (!Array.isArray(po.deliveryHistory) || po.deliveryHistory.length === 0) return;

  const legacyInventoryBump = po.deliveryHistory.some((e) => e && e.recordedInventory !== false);
  if (legacyInventoryBump) return;

  const recvMap = {};
  if (Array.isArray(po.receivedItems)) {
    for (const ri of po.receivedItems) {
      const raw = ri.productId;
      const pid =
        raw && typeof raw === 'object' && raw._id != null ? raw._id.toString() : raw.toString();
      recvMap[pid] = parseFloat(ri.receivedQty) || 0;
    }
  }
  let allLinesBookedAgainstPo = true;
  for (const item of po.items || []) {
    const pid = item.productId.toString();
    const ordered = parseFloat(item.quantity) || 0;
    const rcv = recvMap[pid] || 0;
    if (rcv < ordered - 1e-9) allLinesBookedAgainstPo = false;
  }

  const hasPostedPi = !!(await PurchaseInvoice.exists({
    branchId,
    purchaseOrderId: po._id,
    status: 'posted'
  }));

  const receiptish = ['ordered', 'sent', 'partially_received', 'fully_received', 'received'];

  if (allLinesBookedAgainstPo && hasPostedPi) {
    po.status = 'fully_received';
  } else if (receiptish.includes(po.status)) {
    po.status = 'partially_received';
  }

  await po.save();
}

/**
 * Applies cumulative PO receipts when posting a PI (no prior GRN /receive booking).
 * Skipped when shipment quantities were recorded via `/receive` (`purchaseInvoiceId` absent on delivery events).
 */
async function applyBookOnlyReceiptFromPostingInvoice(models, branchId, inv) {
  const { PurchaseOrder } = models;
  if (!inv.purchaseOrderId) return null;

  const sin = String(inv.supplierInvoiceNumber || '').trim();
  const invoiceQtyByPid = {};
  const lineMetaByPid = {};
  for (const line of inv.lines || []) {
    const qty = parseFloat(line.receivedQty) || 0;
    if (qty <= 0) continue;
    const pid = line.productId.toString();
    invoiceQtyByPid[pid] = (invoiceQtyByPid[pid] || 0) + qty;
    lineMetaByPid[pid] = {
      productName: line.productName,
      unitCost: parseFloat(line.purchasePrice) || 0,
    };
  }
  const pidsInvoice = Object.keys(invoiceQtyByPid);
  if (pidsInvoice.length === 0) return null;

  const po = await PurchaseOrder.findById(inv.purchaseOrderId);
  if (!po || po.branchId.toString() !== branchId.toString()) return 'Purchase order not found';
  if (po.status === 'cancelled') return 'Purchase order is cancelled';

  for (const pid of pidsInvoice) {
    const onPo = po.items.some((it) => it.productId.toString() === pid);
    if (!onPo) return 'Invoice includes a product that is not on the linked purchase order';
  }

  const existingReceivedMap = {};
  if (
    (po.status === 'partially_received' || po.status === 'fully_received' || po.status === 'received') &&
    Array.isArray(po.receivedItems)
  ) {
    for (const ri of po.receivedItems) {
      const pid = (ri.productId || ri._id || ri).toString();
      existingReceivedMap[pid] = parseFloat(ri.receivedQty) || 0;
    }
  }

  const thisDeliveryItems = [];
  const processedItems = [];

  for (const item of po.items || []) {
    const pid = item.productId.toString();
    const thisDeliveryQty = invoiceQtyByPid[pid] || 0;
    const meta = lineMetaByPid[pid];
    const unitCost = meta?.unitCost != null ? meta.unitCost : parseFloat(item.unitCost) || 0;
    const previouslyReceived = existingReceivedMap[pid] || 0;
    const cumulativeReceived = previouslyReceived + thisDeliveryQty;

    if (thisDeliveryQty > 0 && cumulativeReceived > parseFloat(item.quantity) + 1e-9) {
      return 'Posted invoice quantities exceed what is remaining on this purchase order';
    }

    if (thisDeliveryQty > 0) {
      processedItems.push({
        productId: item.productId,
        orderedQty: item.quantity,
        receivedQty: cumulativeReceived,
        unitCost,
      });
      thisDeliveryItems.push({
        productId: item.productId,
        productName: meta?.productName || item.productName,
        receivedQty: thisDeliveryQty,
        unitCost,
      });
    } else {
      processedItems.push({
        productId: item.productId,
        orderedQty: item.quantity,
        receivedQty: previouslyReceived,
        unitCost: parseFloat(item.unitCost) || 0,
      });
    }
  }

  const receivedAt = new Date();
  po.receivedAt = receivedAt;
  po.receivedItems = processedItems;
  if (sin) po.supplierInvoiceNumber = sin;
  if (inv.notes) po.grnNotes = inv.notes;
  po.status = 'partially_received';

  const deliveryEvent = {
    receivedAt,
    receivedItems: thisDeliveryItems,
    grnNotes: inv.notes || '',
    supplierInvoiceNumber: sin,
    recordedInventory: false,
    purchaseInvoiceId: inv._id,
  };
  if (!po.deliveryHistory) po.deliveryHistory = [];
  po.deliveryHistory.push(deliveryEvent);

  await po.save();
  return null;
}

/**
 * Undo PO receipts applied from this PI at post time (events tagged with `purchaseInvoiceId`).
 */
async function rollbackTaggedPoReceiptForPurchaseInvoice(models, branchId, inv) {
  if (!inv.purchaseOrderId) return;
  const { PurchaseOrder } = models;
  const po = await PurchaseOrder.findById(inv.purchaseOrderId);
  if (!po || po.branchId.toString() !== branchId.toString()) return;

  const hist = [...(po.deliveryHistory || [])];
  const invIdStr = inv._id.toString();
  const idx = hist.findIndex((e) => e && e.purchaseInvoiceId && String(e.purchaseInvoiceId) === invIdStr);
  if (idx === -1) return;

  const ev = hist[idx];
  const delMap = {};
  for (const ri of ev.receivedItems || []) {
    const raw = ri.productId;
    const pid = raw && typeof raw === 'object' && raw._id != null ? raw._id.toString() : String(raw);
    delMap[pid] = (delMap[pid] || 0) + (parseFloat(ri.receivedQty) || 0);
  }
  hist.splice(idx, 1);

  const recvMap = {};
  if (Array.isArray(po.receivedItems)) {
    for (const ri of po.receivedItems) {
      const raw = ri.productId;
      const pid = raw && typeof raw === 'object' && raw._id != null ? raw._id.toString() : String(raw);
      recvMap[pid] = parseFloat(ri.receivedQty) || 0;
    }
  }
  for (const pid of Object.keys(delMap)) {
    recvMap[pid] = Math.max(0, (recvMap[pid] || 0) - delMap[pid]);
  }

  let anyPositive = false;
  const nextReceived = [];
  for (const item of po.items || []) {
    const pid = item.productId.toString();
    const amt = recvMap[pid] || 0;
    const ordered = parseFloat(item.quantity) || 0;
    const clamped = Math.min(amt, ordered);
    nextReceived.push({
      productId: item.productId,
      orderedQty: item.quantity,
      receivedQty: clamped,
      unitCost: parseFloat(item.unitCost) || 0,
    });
    if (clamped > 1e-9) anyPositive = true;
  }

  po.receivedItems = anyPositive ? nextReceived : [];
  po.deliveryHistory = hist;
  if (!anyPositive) {
    po.receivedAt = undefined;
    po.supplierInvoiceNumber = '';
    po.grnNotes = '';
  }

  if (hist.length === 0 && !anyPositive) {
    if (['partially_received', 'fully_received', 'received'].includes(po.status)) {
      po.status = 'ordered';
    }
  } else if (anyPositive) {
    const legacyBump = hist.some((e) => e && e.recordedInventory !== false);
    if (!legacyBump) {
      po.status = 'partially_received';
    }
  }

  await po.save();
}

async function upsertPayableFromInvoice(req, inv, supplier) {
  const { SupplierPayable } = req.businessModels;
  const paymentTerms = parseInt(supplier?.paymentTerms || '30', 10) || 30;
  const dueDate = new Date(inv.invoiceDate);
  dueDate.setDate(dueDate.getDate() + paymentTerms);

  const totalAmount = inv.grandTotal || 0;
  const amountPaid = inv.paidAmount || 0;
  let status = 'pending';
  if (amountPaid >= totalAmount - 0.005 && totalAmount > 0) status = 'paid';
  else if (amountPaid > 0) status = 'partial';

  const common = {
    supplierId: inv.supplierId,
    totalAmount,
    amountPaid,
    dueDate,
    status,
    branchId: req.user.branchId,
    paidOn: status === 'paid' ? new Date() : null
  };

  if (inv.purchaseOrderId) {
    let payable = await SupplierPayable.findOne({ purchaseOrderId: inv.purchaseOrderId });
    if (payable) {
      payable.purchaseInvoiceId = inv._id;
      Object.assign(payable, common);
      await payable.save();
      return payable;
    }
    const p = new SupplierPayable({
      ...common,
      purchaseOrderId: inv.purchaseOrderId,
      purchaseInvoiceId: inv._id
    });
    await p.save();
    return p;
  }

  let payable = await SupplierPayable.findOne({ purchaseInvoiceId: inv._id });
  if (payable) {
    Object.assign(payable, common);
    await payable.save();
    return payable;
  }
  const p2 = new SupplierPayable({
    ...common,
    purchaseInvoiceId: inv._id
  });
  await p2.save();
  return p2;
}

router.get('/', async (req, res) => {
  try {
    const { PurchaseInvoice, Supplier } = req.businessModels;
    const { supplier, status, paymentStatus, dateFrom, dateTo, search } = req.query;
    const branchId = req.user.branchId;
    const query = { branchId };
    if (supplier) query.supplierId = supplier;
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      query.invoiceDate = {};
      if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = d;
      }
    }
    if (search && String(search).trim()) {
      const s = String(search).trim();
      const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const supIds = await Supplier.find({ branchId, name: rx }).select('_id').lean();
      const sidList = supIds.map((x) => x._id);
      query.$or = [
        { invoiceNumber: rx },
        { supplierInvoiceNumber: rx },
        ...(sidList.length ? [{ supplierId: { $in: sidList } }] : [])
      ];
    }

    const rows = await PurchaseInvoice.find(query)
      .populate('supplierId', 'name contactPerson phone')
      .populate('purchaseOrderId', 'poNumber orderDate status')
      .sort({ invoiceDate: -1, createdAt: -1, _id: -1 })
      .lean();

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error listing purchase invoices:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { PurchaseInvoice, SupplierPayable, InventoryTransaction } = req.businessModels;
    const inv = await PurchaseInvoice.findOne({
      _id: req.params.id,
      branchId: req.user.branchId
    })
      .populate('supplierId')
      .populate('purchaseOrderId')
      .lean();

    if (!inv) {
      return res.status(404).json({ success: false, error: 'Purchase invoice not found' });
    }

    const payable =
      (await SupplierPayable.findOne({
        branchId: req.user.branchId,
        purchaseInvoiceId: inv._id,
      }).lean()) ||
      (inv.purchaseOrderId
        ? await SupplierPayable.findOne({
            branchId: req.user.branchId,
            purchaseOrderId: inv.purchaseOrderId,
          }).lean()
        : null)

    const txs = await InventoryTransaction.find({
      purchaseInvoiceId: inv._id
    })
      .sort({ transactionDate: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, data: { ...inv, payable, stockTransactions: txs } });
  } catch (error) {
    logger.error('Error fetching purchase invoice:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { PurchaseInvoice, Supplier, Product, PurchaseOrder } = req.businessModels;
    const {
      supplierId,
      purchaseOrderId,
      supplierInvoiceNumber,
      invoiceDate,
      lines,
      notes,
      paymentMethod,
      applyRetailPrices
    } = req.body;

    if (!supplierId) {
      return res.status(400).json({ success: false, error: 'supplierId is required' });
    }
    const supplier = await Supplier.findById(supplierId);
    if (!supplier || supplier.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    let poId = null;
    if (purchaseOrderId) {
      const po = await PurchaseOrder.findById(purchaseOrderId);
      if (!po || po.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(404).json({ success: false, error: 'Purchase order not found' });
      }
      if (po.supplierId.toString() !== supplierId.toString()) {
        return res.status(400).json({ success: false, error: 'Purchase order supplier must match invoice supplier' });
      }
      poId = po._id;
    }

    const builtLines = [];
    for (const it of lines || []) {
      if (!it.productId) continue;
      const prod = await Product.findById(it.productId);
      if (!prod || prod.branchId.toString() !== req.user.branchId.toString()) continue;
      const qty = parseFloat(it.receivedQty) || 0;
      const priceRaw = it.purchasePrice;
      const price =
        priceRaw != null && priceRaw !== '' && !Number.isNaN(parseFloat(priceRaw))
          ? parseFloat(priceRaw)
          : (prod.cost != null ? prod.cost : prod.price || 0);
      const gstRate = parseFloat(it.gstRate) || 0;
      const lineDiscount = parseFloat(it.lineDiscount) || 0;
      const base = Math.max(0, qty * price - lineDiscount);
      const gst = (base * gstRate) / 100;
      const lineTotal = Math.round((base + gst) * 100) / 100;
      builtLines.push({
        productId: prod._id,
        productName: it.productName || prod.name,
        sku: it.sku || prod.sku || '',
        hsnSacCode:
          it.hsnSacCode != null && String(it.hsnSacCode).trim() !== ''
            ? String(it.hsnSacCode).trim()
            : prod.hsnSacCode || '',
        barcode: it.barcode || prod.barcode || '',
        orderedQty: it.orderedQty != null ? parseFloat(it.orderedQty) : null,
        receivedQty: qty,
        purchasePrice: price,
        sellingPrice: it.sellingPrice != null ? parseFloat(it.sellingPrice) : null,
        gstRate,
        lineDiscount,
        unit: typeof it.unit === 'string' ? it.unit.trim() : '',
        batchNumber: it.batchNumber || '',
        expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
        lineTotal,
        poItemProductId: it.poItemProductId || null
      });
    }

    const totals = computeTotalsFromLines(builtLines);
    const invoiceNumber = await allocateInvoiceNumber(req.businessModels, req.user.branchId);

    const inv = new PurchaseInvoice({
      invoiceNumber,
      supplierId,
      supplierInvoiceNumber: (supplierInvoiceNumber || '').trim(),
      invoiceDate: parsePurchaseInvoiceCalendarDate(invoiceDate),
      paymentMethod: paymentMethod || '',
      notes: notes || '',
      ...totals,
      paidAmount: 0,
      dueAmount: totals.grandTotal,
      paymentStatus: 'unpaid',
      status: 'draft',
      purchaseOrderId: poId,
      lines: builtLines,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      applyRetailPrices: !!applyRetailPrices,
    });
    syncPaymentFields(inv, req.body);
    await inv.save();

    res.status(201).json({ success: true, data: inv });
  } catch (error) {
    logger.error('Error creating purchase invoice:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { PurchaseInvoice, Supplier, Product, PurchaseOrder } = req.businessModels;
    const inv = await PurchaseInvoice.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!inv) {
      return res.status(404).json({ success: false, error: 'Purchase invoice not found' });
    }
    if (inv.status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft invoices can be edited' });
    }

    const {
      supplierId,
      purchaseOrderId,
      supplierInvoiceNumber,
      invoiceDate,
      lines,
      notes,
      paymentMethod,
      applyRetailPrices
    } = req.body;

    if (supplierId) {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier || supplier.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }
      inv.supplierId = supplierId;
    }

    if (purchaseOrderId !== undefined) {
      if (!purchaseOrderId) {
        inv.purchaseOrderId = null;
      } else {
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po || po.branchId.toString() !== req.user.branchId.toString()) {
          return res.status(404).json({ success: false, error: 'Purchase order not found' });
        }
        if (po.supplierId.toString() !== inv.supplierId.toString()) {
          return res.status(400).json({ success: false, error: 'Purchase order supplier must match invoice supplier' });
        }
        inv.purchaseOrderId = po._id;
      }
    }

    if (supplierInvoiceNumber !== undefined) inv.supplierInvoiceNumber = String(supplierInvoiceNumber || '').trim();
    if (invoiceDate) inv.invoiceDate = parsePurchaseInvoiceCalendarDate(invoiceDate);
    if (notes !== undefined) inv.notes = notes || '';
    if (paymentMethod !== undefined) inv.paymentMethod = paymentMethod || '';
    if (applyRetailPrices !== undefined) inv.applyRetailPrices = !!applyRetailPrices;

    if (lines && Array.isArray(lines)) {
      const builtLines = [];
      for (const it of lines) {
        if (!it.productId) continue;
        const prod = await Product.findById(it.productId);
        if (!prod || prod.branchId.toString() !== req.user.branchId.toString()) continue;
        const qty = parseFloat(it.receivedQty) || 0;
        const priceRaw = it.purchasePrice;
        const price =
          priceRaw != null && priceRaw !== '' && !Number.isNaN(parseFloat(priceRaw))
            ? parseFloat(priceRaw)
            : (prod.cost != null ? prod.cost : prod.price || 0);
        const gstRate = parseFloat(it.gstRate) || 0;
        const lineDiscount = parseFloat(it.lineDiscount) || 0;
        const base = Math.max(0, qty * price - lineDiscount);
        const gst = (base * gstRate) / 100;
        const lineTotal = Math.round((base + gst) * 100) / 100;
        builtLines.push({
          productId: prod._id,
          productName: it.productName || prod.name,
          sku: it.sku || prod.sku || '',
          hsnSacCode:
            it.hsnSacCode != null && String(it.hsnSacCode).trim() !== ''
              ? String(it.hsnSacCode).trim()
              : prod.hsnSacCode || '',
          barcode: it.barcode || prod.barcode || '',
          orderedQty: it.orderedQty != null ? parseFloat(it.orderedQty) : null,
          receivedQty: qty,
          purchasePrice: price,
          sellingPrice: it.sellingPrice != null ? parseFloat(it.sellingPrice) : null,
          gstRate,
          lineDiscount,
          unit: typeof it.unit === 'string' ? it.unit.trim() : '',
          batchNumber: it.batchNumber || '',
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
          lineTotal,
          poItemProductId: it.poItemProductId || null
        });
      }
      inv.lines = builtLines;
      const totals = computeTotalsFromLines(builtLines);
      inv.subtotal = totals.subtotal;
      inv.discountTotal = totals.discountTotal;
      inv.gstTotal = totals.gstTotal;
      inv.grandTotal = totals.grandTotal;
    }

    syncPaymentFields(inv, req.body);
    await inv.save();
    res.json({ success: true, data: inv });
  } catch (error) {
    logger.error('Error updating purchase invoice:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.post('/:id/post', async (req, res) => {
  try {
    const {
      PurchaseInvoice,
      Product,
      InventoryTransaction,
      Supplier,
      PurchaseOrder
    } = req.businessModels;

    const inv = await PurchaseInvoice.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!inv) {
      return res.status(404).json({ success: false, error: 'Purchase invoice not found' });
    }
    if (inv.status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft invoices can be posted' });
    }

    const sin = (inv.supplierInvoiceNumber || '').trim();
    if (!sin) {
      return res.status(400).json({ success: false, error: 'Supplier invoice number is required to post' });
    }

    const dup = await PurchaseInvoice.findOne({
      branchId: req.user.branchId,
      supplierId: inv.supplierId,
      supplierInvoiceNumber: sin,
      status: { $in: ['draft', 'posted'] },
      _id: { $ne: inv._id }
    });
    if (dup) {
      return res.status(409).json({
        success: false,
        error: 'Supplier invoice number must be unique for this supplier'
      });
    }

    if (!inv.lines || inv.lines.length === 0) {
      return res.status(400).json({ success: false, error: 'Add at least one line item before posting' });
    }
    const anyQty = inv.lines.some((l) => (parseFloat(l.receivedQty) || 0) > 0);
    if (!anyQty) {
      return res.status(400).json({ success: false, error: 'At least one line must have received quantity > 0' });
    }

    let mergePoReceiptsFromPosting = false;
    if (inv.purchaseOrderId) {
      const linkedPo = await PurchaseOrder.findById(inv.purchaseOrderId);
      if (!linkedPo || linkedPo.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(404).json({ success: false, error: 'Purchase order not found' });
      }

      /** Legacy deliveries omit `recordedInventory` (assume stock was bumped at GRN); book-only GRNs set recordedInventory:false. */
      const hasReceiptThatBumpedStock =
        Array.isArray(linkedPo.deliveryHistory) &&
        linkedPo.deliveryHistory.some((e) => e && e.recordedInventory !== false);

      /** Shipment qty booked via `/receive` (no `purchaseInvoiceId` tag) — avoid double-booking when posting PI. */
      const hasUntaggedBookOnlyDeliveries =
        Array.isArray(linkedPo.deliveryHistory) &&
        linkedPo.deliveryHistory.some((e) => e && e.recordedInventory === false && !e.purchaseInvoiceId);

      if (hasReceiptThatBumpedStock && !req.body.confirmLinkedPoDuplicate) {
        return res.status(409).json({
          success: false,
          error: 'linked_po_has_receipts',
          message:
            'This purchase order already has stock receipts. Posting this invoice will add stock again. Pass confirmLinkedPoDuplicate: true if this is intentional.'
        });
      }

      mergePoReceiptsFromPosting = !hasReceiptThatBumpedStock && !hasUntaggedBookOnlyDeliveries;
    }

    let poBookingErr = null;
    if (inv.purchaseOrderId && mergePoReceiptsFromPosting) {
      poBookingErr = await applyBookOnlyReceiptFromPostingInvoice(req.businessModels, req.user.branchId, inv);
    }
    if (poBookingErr) {
      return res.status(400).json({ success: false, error: poBookingErr });
    }

    const supplier = await Supplier.findById(inv.supplierId);
    if (!supplier) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    /** When true, also write catalog fields from each line to the product (e.g. MRP). Cost & stock always update from the invoice. */
    const applyRetailPrices =
      typeof req.body.applyRetailPrices === 'boolean'
        ? req.body.applyRetailPrices
        : !!inv.applyRetailPrices;
    const postedSnapshot = [];

    for (const line of inv.lines) {
      const qty = parseFloat(line.receivedQty) || 0;
      if (qty <= 0) continue;
      const product = await Product.findById(line.productId);
      if (!product || product.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(400).json({ success: false, error: `Invalid product on line: ${line.productName}` });
      }
      const unitCost = parseFloat(line.purchasePrice) || 0;
      const prevStock = product.stock || 0;
      const newStock = prevStock + qty;

      const update = { stock: newStock, cost: unitCost };
      if (applyRetailPrices) {
        if (line.sellingPrice != null && !Number.isNaN(parseFloat(line.sellingPrice))) {
          update.price = parseFloat(line.sellingPrice);
        }
        const hsnTrim = typeof line.hsnSacCode === 'string' ? line.hsnSacCode.trim() : '';
        if (hsnTrim) update.hsnSacCode = hsnTrim;
        const skuTrim = typeof line.sku === 'string' ? line.sku.trim() : '';
        if (skuTrim) {
          update.sku = skuTrim;
          update.barcode = skuTrim;
        }
      }
      await Product.findByIdAndUpdate(product._id, update);

      await new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: 'purchase_invoice',
        quantity: qty,
        previousStock: prevStock,
        newStock,
        unitCost,
        totalValue: qty * unitCost,
        referenceType: 'purchase_invoice',
        referenceId: inv._id.toString(),
        referenceNumber: inv.invoiceNumber,
        purchaseInvoiceId: inv._id,
        purchaseOrderId: inv.purchaseOrderId || null,
        processedBy: req.user.email || 'System',
        location: 'main',
        reason: 'Purchase invoice posted',
        notes: line.batchNumber ? `Batch: ${line.batchNumber}` : '',
        transactionDate: new Date()
      }).save();

      postedSnapshot.push({
        productId: product._id,
        productName: product.name,
        receivedQty: qty,
        purchasePrice: unitCost,
        lineTotal: line.lineTotal || 0
      });
    }

    inv.postedLinesSnapshot = postedSnapshot;
    inv.postedAt = new Date();
    inv.postedBy = req.user._id;
    inv.status = 'posted';
    syncPaymentFields(inv, req.body);
    await inv.save();

    const payable = await upsertPayableFromInvoice(req, inv, supplier);
    await reconcileLinkedPurchaseOrderStatus(req.businessModels, req.user.branchId, inv.purchaseOrderId);

    res.json({ success: true, data: { purchaseInvoice: inv, payable } });
  } catch (error) {
    logger.error('Error posting purchase invoice:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const { PurchaseInvoice, Product, InventoryTransaction, SupplierPayable, PurchaseOrder, Supplier } =
      req.businessModels;
    const inv = await PurchaseInvoice.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!inv) {
      return res.status(404).json({ success: false, error: 'Purchase invoice not found' });
    }
    if (inv.status === 'cancelled') {
      return res.json({ success: true, data: inv });
    }

    if (inv.status === 'draft') {
      inv.status = 'cancelled';
      await inv.save();
      return res.json({ success: true, data: inv });
    }

    if (inv.status !== 'posted') {
      return res.status(400).json({ success: false, error: 'Only posted invoices can be cancelled this way' });
    }

    const payableQuery = inv.purchaseOrderId
      ? {
          branchId: req.user.branchId,
          $or: [{ purchaseInvoiceId: inv._id }, { purchaseOrderId: inv.purchaseOrderId }],
        }
      : { branchId: req.user.branchId, purchaseInvoiceId: inv._id };
    const payable = await SupplierPayable.findOne(payableQuery);

    if (payable && (payable.amountPaid || 0) > 0.005) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel: supplier payments exist on this payable. Reverse payments first or use stock adjustment.'
      });
    }

    const snapshot = inv.postedLinesSnapshot?.length ? inv.postedLinesSnapshot : inv.lines;

    for (const line of snapshot) {
      const qty = parseFloat(line.receivedQty) || 0;
      if (qty <= 0) continue;
      const product = await Product.findById(line.productId);
      if (!product) continue;
      const prevStock = product.stock || 0;
      const newStock = prevStock - qty;
      await Product.findByIdAndUpdate(product._id, { stock: newStock });

      const unitCost = parseFloat(line.purchasePrice) || 0;
      await new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: 'purchase_invoice_cancellation',
        quantity: -qty,
        previousStock: prevStock,
        newStock,
        unitCost,
        totalValue: qty * unitCost,
        referenceType: 'purchase_invoice',
        referenceId: inv._id.toString(),
        referenceNumber: inv.invoiceNumber,
        purchaseInvoiceId: inv._id,
        purchaseOrderId: inv.purchaseOrderId || null,
        processedBy: req.user.email || 'System',
        location: 'main',
        reason: 'Purchase invoice cancelled',
        notes: '',
        transactionDate: new Date()
      }).save();
    }

    await rollbackTaggedPoReceiptForPurchaseInvoice(req.businessModels, req.user.branchId, inv);

    if (payable) {
      if (payable.purchaseOrderId) {
        const po = await PurchaseOrder.findById(payable.purchaseOrderId);
        const supplier = po ? await Supplier.findById(po.supplierId) : null;
        const paymentTerms = parseInt(supplier?.paymentTerms || '30', 10) || 30;
        const dueDate = po ? new Date(po.orderDate) : new Date();
        if (po) dueDate.setDate(dueDate.getDate() + paymentTerms);
        payable.purchaseInvoiceId = undefined;
        payable.totalAmount = po ? po.grandTotal : payable.totalAmount;
        payable.amountPaid = 0;
        payable.status = 'pending';
        payable.dueDate = dueDate;
        payable.paidOn = null;
        await payable.save();
      } else {
        await SupplierPayable.deleteOne({ _id: payable._id });
      }
    }

    inv.status = 'cancelled';
    const linkedPoId = inv.purchaseOrderId;
    await inv.save();

    await reconcileLinkedPurchaseOrderStatus(req.businessModels, req.user.branchId, linkedPoId);

    res.json({ success: true, data: inv });
  } catch (error) {
    logger.error('Error cancelling purchase invoice:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/** Permanently remove a cancelled invoice (no outstanding supplier payments on its payable). */
router.delete('/:id', async (req, res) => {
  try {
    const { PurchaseInvoice, SupplierPayable } = req.businessModels;
    const branchId = req.user.branchId;
    const inv = await PurchaseInvoice.findOne({ _id: req.params.id, branchId });
    if (!inv) {
      return res.status(404).json({ success: false, error: 'Purchase invoice not found' });
    }
    if (inv.status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Only cancelled invoices can be permanently deleted',
      });
    }
    const payable = await SupplierPayable.findOne({ branchId, purchaseInvoiceId: inv._id });
    if (payable && (payable.amountPaid || 0) > 0.005) {
      return res.status(400).json({
        success: false,
        error: 'This invoice still has supplier payments recorded. Reverse payments before deleting.',
      });
    }
    if (payable) {
      await SupplierPayable.deleteOne({ _id: payable._id });
    }
    const linkedPoId = inv.purchaseOrderId;
    await PurchaseInvoice.deleteOne({ _id: inv._id });
    if (linkedPoId) {
      await reconcileLinkedPurchaseOrderStatus(req.businessModels, branchId, linkedPoId);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting purchase invoice:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

module.exports = router;
