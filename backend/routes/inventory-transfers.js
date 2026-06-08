/**
 * Tenant-scoped transfer requests — /api/inventory/transfers/*
 * Staff with products edit + owners; branch-scoped actions for staff.
 */

const express = require('express');
const { z } = require('zod');
const { authenticateToken } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const { loadEntitlements } = require('../middleware/feature-gate');
const { requirePermission } = require('../middleware/permissions');
const { requireMultiBranchTransfers } = require('../middleware/requireMultiBranchTransfers');
const { validate } = require('../middleware/validate');
const { getTransferRequestModel } = require('../lib/transfer-request-model');
const { executeInventoryTransfer, findProductByKey } = require('../lib/execute-inventory-transfer');
const {
  normalizeBranchId,
  getTransferPermissions,
  serializeTransferRow,
  branchEq,
} = require('../lib/transfer-request-permissions');
const mongoose = require('mongoose');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

const router = express.Router();

const guard = [
  authenticateToken,
  setupMainDatabase,
  loadEntitlements,
  requireMultiBranchTransfers,
  requirePermission('products', 'edit'),
];

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function branchInOrg(branchList, branchId) {
  return branchList.some((b) => String(b.id) === String(branchId));
}

function canCreateTransfer(ctx, fromBranchId, toBranchId) {
  if (String(fromBranchId) === String(toBranchId)) return false;
  if (!branchInOrg(ctx.branchList, fromBranchId) || !branchInOrg(ctx.branchList, toBranchId)) {
    return false;
  }
  if (ctx.isOrgOwner) return true;
  const cur = ctx.currentBranchId;
  return String(fromBranchId) === cur || String(toBranchId) === cur;
}

/** Counterparty of the initiator approves (receiver for send-out, sender for request-in). */
function branchObjectId(id) {
  const s = normalizeBranchId(id);
  if (mongoose.Types.ObjectId.isValid(s)) {
    return new mongoose.Types.ObjectId(s);
  }
  return s;
}

function canApproveOrReject(ctx, transfer) {
  return getTransferPermissions(transfer, ctx.currentBranchId).canApprove;
}

function canCancel(ctx, transfer) {
  return getTransferPermissions(transfer, ctx.currentBranchId).canCancel;
}

function buildListFilter(ctx, query) {
  const filter = { ownerId: ctx.ownerId };
  const direction = query.direction || 'all';
  const curOid = branchObjectId(ctx.currentBranchId);

  if (direction === 'incoming') {
    filter.toBranchId = curOid;
  } else if (direction === 'outgoing') {
    filter.fromBranchId = curOid;
  } else if (!ctx.isOrgOwner) {
    filter.$or = [{ fromBranchId: curOid }, { toBranchId: curOid }];
  }

  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.productName = { $regex: escapeRegex(query.search), $options: 'i' };
  }
  return filter;
}

/* GET /eligibility */
router.get('/eligibility', guard, async (req, res) => {
  try {
    const ctx = req.transferContext;
    res.json({
      success: true,
      data: {
        enabled: true,
        currentBranchId: ctx.currentBranchId,
        isOrgOwner: ctx.isOrgOwner,
        branches: ctx.branchList.map((b) => ({
          id: b.id,
          name: b.name,
          city: b.city || '',
        })),
      },
    });
  } catch (error) {
    logger.error('inventory-transfers eligibility error:', error);
    res.status(500).json({ success: false, error: 'Failed to check eligibility' });
  }
});

/* GET / */
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    status: z.string().optional(),
    direction: z.enum(['incoming', 'outgoing', 'all']).optional(),
    search: z.string().optional(),
  })
  .passthrough();

router.get('/', guard, validate(listSchema, 'query'), async (req, res) => {
  try {
    const ctx = req.transferContext;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const filter = buildListFilter(ctx, req.query);
    const TransferRequest = getTransferRequestModel(req.mainConnection);

    const [total, transfers] = await Promise.all([
      TransferRequest.countDocuments(filter),
      TransferRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        transfers: transfers.map((t) => serializeTransferRow(t, ctx.currentBranchId)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
        currentBranchId: ctx.currentBranchId,
        isOrgOwner: ctx.isOrgOwner,
      },
    });
  } catch (error) {
    logger.error('inventory-transfers list error:', error);
    res.status(500).json({ success: false, error: 'Failed to load transfers' });
  }
});

/* GET /products/:productKey/stock */
router.get(
  '/products/:productKey/stock',
  guard,
  validate(z.object({ productKey: z.string().min(1).max(200) }).strict(), 'params'),
  async (req, res) => {
    try {
      const ctx = req.transferContext;
      const { productKey } = req.params;
      const branches = [];

      for (const branch of ctx.branchList) {
        try {
          const conn = await databaseManager.getConnection(branch.code, req.mainConnection);
          const { Product } = modelFactory.createBusinessModels(conn);
          const product = await findProductByKey(Product, productKey);
          branches.push({
            branchId: branch.id,
            branchName: branch.name,
            stock: product ? product.stock || 0 : null,
            found: !!product,
          });
        } catch (err) {
          branches.push({
            branchId: branch.id,
            branchName: branch.name,
            stock: null,
            found: false,
            error: err.message,
          });
        }
      }

      res.json({ success: true, data: { productKey, branches } });
    } catch (error) {
      logger.error('inventory-transfers stock lookup error:', error);
      res.status(500).json({ success: false, error: 'Failed to load stock' });
    }
  }
);

/* POST / */
const createSchema = z
  .object({
    fromBranchId: z.string().regex(/^[a-fA-F0-9]{24}$/),
    toBranchId: z.string().regex(/^[a-fA-F0-9]{24}$/),
    productKey: z.string().trim().min(1),
    productName: z.string().trim().min(1),
    sku: z.string().optional(),
    quantity: z.number().int().min(1),
    notes: z.string().max(500).optional(),
  })
  .strict();

router.post('/', guard, validate(createSchema), async (req, res) => {
  try {
    const ctx = req.transferContext;
    const { fromBranchId, toBranchId } = req.body;

    if (!canCreateTransfer(ctx, fromBranchId, toBranchId)) {
      return res.status(403).json({
        success: false,
        error: 'You cannot create this transfer for the selected branches',
      });
    }

    const TransferRequest = getTransferRequestModel(req.mainConnection);
    const doc = await TransferRequest.create({
      ...req.body,
      ownerId: ctx.ownerId,
      requestedBy: req.user._id,
      initiatedByBranchId: branchObjectId(ctx.currentBranchId),
      status: 'pending',
    });

    res.status(201).json({ success: true, data: { transfer: doc } });
  } catch (error) {
    logger.error('inventory-transfers create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create transfer request' });
  }
});

/* PATCH /:id */
const patchSchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'cancelled']),
    notes: z.string().max(500).optional(),
  })
  .strict();

router.patch(
  '/:id',
  guard,
  validate(z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/) }).strict(), 'params'),
  validate(patchSchema),
  async (req, res) => {
    try {
      const ctx = req.transferContext;
      const TransferRequest = getTransferRequestModel(req.mainConnection);
      const transfer = await TransferRequest.findOne({
        _id: req.params.id,
        ownerId: ctx.ownerId,
      });

      if (!transfer) {
        return res.status(404).json({ success: false, error: 'Transfer not found' });
      }

      if (!ctx.isOrgOwner) {
        const involved =
          branchEq(transfer.fromBranchId, ctx.currentBranchId) ||
          branchEq(transfer.toBranchId, ctx.currentBranchId);
        if (!involved) {
          return res.status(403).json({ success: false, error: 'Transfer not accessible' });
        }
      }

      if (transfer.status !== 'pending') {
        return res.status(409).json({ success: false, error: 'Transfer already processed' });
      }

      const { status, notes } = req.body;

      if (status === 'cancelled') {
        if (!canCancel(ctx, transfer)) {
          return res.status(403).json({ success: false, error: 'Only the initiating branch can cancel' });
        }
        transfer.status = 'cancelled';
        transfer.reviewedBy = req.user._id;
        if (notes) transfer.notes = notes;
        await transfer.save();
        return res.json({ success: true, data: { transfer } });
      }

      if (status === 'rejected') {
        if (!canApproveOrReject(ctx, transfer)) {
          return res.status(403).json({ success: false, error: 'Only the approving branch can reject' });
        }
        transfer.status = 'rejected';
        transfer.reviewedBy = req.user._id;
        if (notes) transfer.notes = notes;
        await transfer.save();
        return res.json({ success: true, data: { transfer } });
      }

      // approved
      if (!canApproveOrReject(ctx, transfer)) {
        return res.status(403).json({ success: false, error: 'Only the approving branch can approve' });
      }

      const result = await executeInventoryTransfer({
        mainConnection: req.mainConnection,
        transfer,
        branchList: ctx.branchList,
        processedBy: req.user.email || req.user.firstName || 'System',
      });

      if (result.ok) {
        transfer.status = 'completed';
        transfer.completedAt = new Date();
      } else {
        transfer.notes =
          (transfer.notes || '') + (result.errors[0] ? ` Execution failed: ${result.errors[0]}` : '');
      }

      transfer.reviewedBy = req.user._id;
      if (notes) transfer.notes = notes;
      await transfer.save();

      if (!result.ok) {
        return res.status(409).json({
          success: false,
          error: result.errors[0] || 'Transfer execution failed',
          data: { transfer, errors: result.errors },
        });
      }

      res.json({ success: true, data: { transfer } });
    } catch (error) {
      logger.error('inventory-transfers patch error:', error);
      res.status(500).json({ success: false, error: 'Failed to update transfer' });
    }
  }
);

module.exports = router;
