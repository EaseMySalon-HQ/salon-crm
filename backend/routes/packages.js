/**
 * /backend/routes/packages.js
 *
 * All routes for the Packages feature.
 *
 * ROUTING ORDER RULE — DO NOT CHANGE WITHOUT READING THIS:
 * Express matches routes top-to-bottom. Routes with LITERAL path segments
 * (/client, /client-packages, /redemptions, /reports) MUST be registered
 * BEFORE any wildcard routes (/:id). The same rule applies at every depth:
 * /client-packages/summary must come before /client-packages/:id/extend.
 *
 * FIRST  → POST /                              (createPackage)
 * FIRST  → GET  /                              (getAllPackages)
 * MIDDLE → GET   /client/:clientId             (getClientPackages)
 * MIDDLE → PATCH /client-packages/:id/extend   (extendExpiry)
 * MIDDLE → POST  /client-packages/:id/redeem   (redeemPackage)
 * MIDDLE → GET   /client-packages/:id/history  (getRedemptionHistory)
 * MIDDLE → GET   /client-packages/:id/sessions (list package sessions)
 * MIDDLE → POST  /client-packages/:id/sessions/schedule (schedule session)
 * MIDDLE → POST  /redemptions/:id/reverse      (reverseRedemption)
 * MIDDLE → GET   /reports/sales                (getSalesReport)
 * MIDDLE → GET   /reports/utilization          (getUtilizationReport)
 * MIDDLE → GET   /reports/expiring             (getExpiringReport)
 * MIDDLE → POST  /reports/export               (exportReport)
 * LAST   → GET    /:id                         (getPackageById)
 * LAST   → PUT    /:id                         (updatePackage)
 * LAST   → PATCH  /:id/status                  (updatePackageStatus)
 * LAST   → DELETE /:id                         (deletePackage)
 * LAST   → POST   /:id/sell                    (sellPackage)
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { logger } = require('../utils/logger');
const { authenticateToken, requireManager, requireAdmin } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const packageSvc = require('../services/package-service');
const { sendPackageNotification } = require('../services/package-notification-service');
const databaseManager = require('../config/database-manager');
const packageSessionSvc = require('../services/scheduling/package-session-service');

// All package routes require auth + business DB setup
const auth = [authenticateToken, setupBusinessDatabase];
const authManager = [authenticateToken, setupBusinessDatabase, requireManager];

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(res, data, message = 'Success') {
  return res.json({ success: true, data, message, errors: [] });
}

function fail(res, status, message, errors = []) {
  return res.status(status).json({ success: false, data: null, message, errors });
}

async function loadBusinessDocForScheduling(branchId) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  return Business.findById(branchId).lean();
}

async function auditLog(AuditModel, branchId, package_id, action, performed_by, old_value, new_value) {
  try {
    await AuditModel.create({ branchId, package_id, action, performed_by, old_value, new_value });
  } catch (e) {
    logger.error('[PackageAudit] Failed to write audit log:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRST BLOCK — no path variables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/packages
 * Create a new package (manager/admin only)
 */
router.post('/', authManager, async (req, res) => {
  try {
    const { Package, PackageService, Service, PackageAuditLog } = req.businessModels;
    const branchId = req.user.branchId;

    const {
      name, description, image_url, type,
      total_price, discount_amount, discount_type,
      min_service_count, max_service_count, total_sittings,
      validity_days, status, branch_ids, cross_branch_redemption,
      services = []
    } = req.body;

    // Validate: at least 1 service
    if (!services || services.length === 0) {
      return fail(res, 400, 'A package must include at least one service.', ['NO_SERVICES']);
    }

    // Check for duplicate name
    const isDuplicate = await packageSvc.checkDuplicatePackageName(name, branchId, Package);
    if (isDuplicate) {
      return fail(res, 400, `A package named "${name}" already exists.`, ['DUPLICATE_NAME']);
    }

    // Multi-branch assignment: only admin (owner)
    const assignedBranches = branch_ids || [];
    if (assignedBranches.length > 0 && req.user.role !== 'admin') {
      return fail(res, 403, 'Only the salon owner can assign packages to multiple branches.', ['INSUFFICIENT_PERMISSIONS']);
    }

    // Cross-branch toggle: only admin (owner)
    if (cross_branch_redemption && req.user.role !== 'admin') {
      return fail(res, 403, 'Only the salon owner can enable cross-branch redemption.', ['INSUFFICIENT_PERMISSIONS']);
    }

    // Warn if package price > sum of service prices (not a block)
    const serviceIds = services.map(s => s.service_id || s);
    const serviceSum = await packageSvc.calculateServicePriceSum(serviceIds, Service);
    const priceWarning = total_price > serviceSum
      ? null  // package is cheaper — good deal
      : total_price < serviceSum
        ? null  // also fine
        : null;
    const isPriceBelowSum = total_price > serviceSum;

    // Create package
    const pkg = await Package.create({
      branchId,
      name: name.trim(),
      description,
      image_url,
      type,
      total_price,
      discount_amount: discount_amount || 0,
      discount_type: discount_type || null,
      min_service_count: min_service_count || 1,
      max_service_count: max_service_count || null,
      total_sittings,
      validity_days: validity_days !== undefined ? validity_days : null,
      status: status || 'ACTIVE',
      branch_ids: assignedBranches,
      cross_branch_redemption: !!cross_branch_redemption,
      created_by: req.user._id
    });

    // Create PackageService entries
    const serviceDocs = services.map(s => ({
      branchId,
      package_id: pkg._id,
      service_id: s.service_id || s,
      is_optional: s.is_optional || false,
      tag: s.tag || null
    }));
    await PackageService.insertMany(serviceDocs);

    await auditLog(PackageAuditLog, branchId, pkg._id, 'PACKAGE_CREATED', req.user._id, null, pkg.toObject());

    const response = { package: pkg, warning: isPriceBelowSum ? 'Package price exceeds sum of individual service prices.' : null };
    return ok(res, response, 'Package created successfully.');
  } catch (err) {
    logger.error('[createPackage]', err);
    return fail(res, 500, 'Failed to create package.');
  }
});

/**
 * GET /api/packages
 * List all packages for this tenant (all authenticated roles)
 */
router.get('/', auth, async (req, res) => {
  try {
    const { Package, PackageService } = req.businessModels;
    const branchId = req.user.branchId;
    const { type, status, tag, search, page = 1, limit = 50 } = req.query;

    const query = { branchId };
    if (type) query.type = type;
    if (status) query.status = status;
    else query.status = { $ne: 'ARCHIVED' };  // default: hide archived
    if (search) query.name = { $regex: search, $options: 'i' };

    const packages = await Package.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Package.countDocuments(query);

    // Attach service count per package
    const packageIds = packages.map(p => p._id);
    const serviceCounts = await PackageService.aggregate([
      { $match: { package_id: { $in: packageIds } } },
      { $group: { _id: '$package_id', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    serviceCounts.forEach(sc => { countMap[sc._id.toString()] = sc.count; });
    const enriched = packages.map(p => ({ ...p, service_count: countMap[p._id.toString()] || 0 }));

    return ok(res, { packages: enriched, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error('[getAllPackages]', err);
    return fail(res, 500, 'Failed to fetch packages.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLE BLOCK — literal segments at position 1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/packages/client/:clientId
 * Get all packages for a client
 */
router.get('/client/:clientId', auth, async (req, res) => {
  try {
    const { ClientPackage } = req.businessModels;
    const branchId = req.user.branchId;

    const clientPackages = await ClientPackage.find({
      branchId,
      client_id: req.params.clientId
    })
      .populate('package_id', 'name type total_price total_sittings validity_days')
      .populate('sold_by_staff_id', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return ok(res, clientPackages);
  } catch (err) {
    logger.error('[getClientPackages]', err);
    return fail(res, 500, 'Failed to fetch client packages.');
  }
});

/**
 * PATCH /api/packages/client-packages/:id/extend
 * Extend expiry date (manager/admin only, reason required)
 */
router.patch('/client-packages/:id/extend', authManager, async (req, res) => {
  try {
    const { ClientPackage, PackageAuditLog, Client, PackageNotification } = req.businessModels;
    const branchId = req.user.branchId;
    const { new_expiry_date, reason } = req.body;

    if (!reason || !reason.trim()) {
      return fail(res, 400, 'A reason is required to extend the expiry date.', ['REASON_REQUIRED']);
    }
    if (!new_expiry_date) {
      return fail(res, 400, 'new_expiry_date is required.', ['MISSING_EXPIRY_DATE']);
    }

    const cp = await ClientPackage.findOne({ _id: req.params.id, branchId }).populate('package_id', 'name');
    if (!cp) return fail(res, 404, 'Client package not found.');

    const oldExpiry = cp.expiry_date;
    cp.expiry_date = new Date(new_expiry_date);
    // If it was EXPIRED and now has a future date, reactivate
    if (cp.status === 'EXPIRED' && cp.expiry_date > new Date()) {
      cp.status = 'ACTIVE';
    }
    await cp.save();

    await auditLog(
      PackageAuditLog, branchId, cp.package_id?._id, 'EXPIRY_EXTENDED',
      req.user._id,
      { expiry_date: oldExpiry, reason: null },
      { expiry_date: cp.expiry_date, reason }
    );

    // Notify client
    const client = await Client.findById(cp.client_id).select('name phone email').lean();
    if (client) {
      await sendPackageNotification(client, cp, 'EXPIRY_7D', 'EaseMySalon', PackageNotification).catch(() => {});
    }

    return ok(res, cp, 'Expiry date extended successfully.');
  } catch (err) {
    logger.error('[extendExpiry]', err);
    return fail(res, 500, 'Failed to extend expiry.');
  }
});

/**
 * POST /api/packages/client-packages/:id/redeem
 * Redeem a sitting — uses MongoDB atomic op to prevent double-redemption
 */
router.post('/client-packages/:id/redeem', auth, async (req, res) => {
  try {
    const { ClientPackage, Package, PackageRedemption, PackageAuditLog, PackageNotification, Client, Service } = req.businessModels;
    const branchId = req.user.branchId;
    const { services = [], redeemed_at_branch_id } = req.body;

    // ── Step 1: Fetch the client package first (for cross-branch + expiry checks)
    const existing = await ClientPackage.findOne({ _id: req.params.id, branchId })
      .populate('package_id')
      .lean();

    if (!existing) return fail(res, 404, 'Client package not found.');

    if (existing.status === 'EXPIRED') {
      return fail(res, 403, 'This package has expired.', ['PACKAGE_EXPIRED']);
    }
    if (existing.status === 'EXHAUSTED') {
      return fail(res, 403, 'No sittings remaining on this package.', ['NO_SITTINGS_LEFT']);
    }
    if (existing.status === 'CANCELLED') {
      return fail(res, 403, 'This package has been cancelled.', ['PACKAGE_CANCELLED']);
    }

    // Cross-branch check
    const redeemingBranch = redeemed_at_branch_id || branchId;
    const pkg = existing.package_id;
    if (
      redeemingBranch.toString() !== branchId.toString() &&
      !pkg.cross_branch_redemption
    ) {
      return fail(res, 403, 'Cross-branch redemption is not enabled for this package.', ['CROSS_BRANCH_NOT_ALLOWED']);
    }

    // ── Step 2: Validate min service count
    const minCheck = packageSvc.validateMinServiceCount(services, pkg.min_service_count || 1);
    if (!minCheck.valid) {
      return fail(res, 400, minCheck.message, ['MIN_SERVICE_COUNT_NOT_MET']);
    }

    // ── Step 3: Atomic decrement — prevents concurrent double-redemption
    const updated = await ClientPackage.findOneAndUpdate(
      {
        _id: req.params.id,
        branchId,
        remaining_sittings: { $gt: 0 },
        status: 'ACTIVE'
      },
      {
        $inc: { remaining_sittings: -1, used_sittings: 1 }
      },
      { new: true }
    );

    if (!updated) {
      return fail(res, 409, 'Package is unavailable or has already been redeemed concurrently. Please retry.', ['CONFLICT']);
    }

    // ── Step 4: Build service snapshot
    const serviceIds = services.map(s => s.service_id || s);
    const servicesSnapshot = await packageSvc.buildRedemptionSnapshot(serviceIds, Service);

    // ── Step 5: Create redemption record
    const redemption = await PackageRedemption.create({
      branchId,
      client_package_id: updated._id,
      client_id: updated.client_id,
      redeemed_at: new Date(),
      redeemed_by_staff_id: req.user._id,
      redeemed_at_branch_id: redeemingBranch,
      sitting_number: updated.used_sittings,
      services_redeemed: servicesSnapshot
    });

    // ── Step 6: Mark EXHAUSTED if no sittings left
    if (updated.remaining_sittings === 0) {
      await ClientPackage.findByIdAndUpdate(updated._id, { status: 'EXHAUSTED' });
      updated.status = 'EXHAUSTED';
    }

    // ── Step 7: LOW_BALANCE notification when 1 sitting remains
    if (updated.remaining_sittings === 1) {
      const client = await Client.findById(updated.client_id).select('name phone email').lean();
      if (client) {
        await sendPackageNotification(
          client, { ...updated.toObject(), package_id: pkg }, 'LOW_BALANCE',
          'EaseMySalon', PackageNotification
        ).catch(() => {});
      }
    }

    await auditLog(
      PackageAuditLog, branchId, pkg._id, 'REDEMPTION',
      req.user._id, null,
      { sitting_number: updated.used_sittings, services: serviceIds }
    );

    return ok(res, { clientPackage: updated, redemption }, 'Package redeemed successfully.');
  } catch (err) {
    logger.error('[redeemPackage]', err);
    return fail(res, 500, 'Failed to redeem package.');
  }
});

/**
 * GET /api/packages/client-packages/:id/history
 * Full redemption history for a client package
 */
router.get('/client-packages/:id/history', auth, async (req, res) => {
  try {
    const { ClientPackage, PackageRedemption } = req.businessModels;
    const branchId = req.user.branchId;

    const cp = await ClientPackage.findOne({ _id: req.params.id, branchId })
      .populate('package_id', 'name type')
      .populate('client_id', 'name phone')
      .lean();
    if (!cp) return fail(res, 404, 'Client package not found.');

    const history = await PackageRedemption.find({ client_package_id: req.params.id })
      .sort({ sitting_number: 1 })
      .lean();

    return ok(res, { clientPackage: cp, history });
  } catch (err) {
    logger.error('[getRedemptionHistory]', err);
    return fail(res, 500, 'Failed to fetch redemption history.');
  }
});

/**
 * GET /api/packages/client-packages/:id/sessions
 */
router.get('/client-packages/:id/sessions', auth, async (req, res) => {
  try {
    const data = await packageSessionSvc.listSessions(req.businessModels, req.params.id);
    return ok(res, data);
  } catch (err) {
    logger.error('[getPackageSessions]', err);
    const msg = err.message || 'Failed to list sessions.';
    const code = err.code;
    const status = code === 'NOT_FOUND' ? 404 : 500;
    return fail(res, status, msg, code ? [code] : []);
  }
});

/**
 * POST /api/packages/client-packages/:id/sessions/schedule
 */
router.post('/client-packages/:id/sessions/schedule', auth, async (req, res) => {
  try {
    const businessDoc = await loadBusinessDocForScheduling(req.user.branchId);
    if (!businessDoc) return fail(res, 404, 'Business not found.');
    const data = await packageSessionSvc.schedulePackageSession(req.businessModels, businessDoc, {
      clientPackageId: req.params.id,
      ...req.body,
      createdBy: req.user?.name || req.user?.email || ''
    });
    return ok(res, data, 'Session scheduled.');
  } catch (err) {
    logger.error('[schedulePackageSession]', err);
    const code = err.code;
    const status =
      code === 'NOT_FOUND' || code === 'SESSION_NOT_FOUND' ? 404
        : code === 'CONFLICT' ? 409
          : code === 'PACKAGE_EXPIRED' || code === 'SESSION_EXPIRED' || code === 'OUTSIDE_AVAILABILITY' || code === 'VALIDATION' || code === 'ALREADY_SCHEDULED' ? 400
            : code === 'PAYMENT_PENDING' ? 400
              : 500;
    return fail(res, status, err.message || 'Failed to schedule session.', code ? [code] : []);
  }
});

/**
 * POST /api/packages/redemptions/:id/reverse
 * Reverse a redemption — restores sitting count (manager/admin only)
 */
router.post('/redemptions/:id/reverse', authManager, async (req, res) => {
  try {
    const { PackageRedemption, ClientPackage, PackageAuditLog } = req.businessModels;
    const branchId = req.user.branchId;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return fail(res, 400, 'A reversal reason is required.', ['REASON_REQUIRED']);
    }

    const redemption = await PackageRedemption.findOne({ _id: req.params.id, branchId });
    if (!redemption) return fail(res, 404, 'Redemption record not found.');
    if (redemption.is_reversed) return fail(res, 409, 'This redemption has already been reversed.');

    // Mark reversed
    redemption.is_reversed = true;
    redemption.reversed_by = req.user._id;
    redemption.reversed_at = new Date();
    redemption.reversal_reason = reason.trim();
    await redemption.save();

    // Restore sitting counts atomically
    const updated = await ClientPackage.findByIdAndUpdate(
      redemption.client_package_id,
      { $inc: { remaining_sittings: 1, used_sittings: -1 } },
      { new: true }
    );

    // Restore from EXHAUSTED to ACTIVE
    if (updated && updated.status === 'EXHAUSTED') {
      await ClientPackage.findByIdAndUpdate(updated._id, { status: 'ACTIVE' });
      updated.status = 'ACTIVE';
    }

    await auditLog(
      PackageAuditLog, branchId, null, 'REVERSAL',
      req.user._id,
      { redemption_id: redemption._id },
      { reason, reversed_at: redemption.reversed_at }
    );

    return ok(res, { redemption, clientPackage: updated }, 'Redemption reversed successfully.');
  } catch (err) {
    logger.error('[reverseRedemption]', err);
    return fail(res, 500, 'Failed to reverse redemption.');
  }
});

// ── Reports ──────────────────────────────────────────────────────────────────

/**
 * GET /api/packages/reports/sales
 */
router.get('/reports/sales', authManager, async (req, res) => {
  try {
    const { ClientPackage, Package } = req.businessModels;
    const branchId = req.user.branchId;
    const { from, to, package_id } = req.query;

    const match = { branchId };
    if (package_id) match.package_id = package_id;
    if (from || to) {
      match.purchase_date = {};
      if (from) match.purchase_date.$gte = new Date(from);
      if (to) match.purchase_date.$lte = new Date(to);
    }

    const sales = await ClientPackage.find(match)
      .populate('package_id', 'name type total_price')
      .populate('client_id', 'name phone')
      .sort({ purchase_date: -1 })
      .lean();

    const totalRevenue = sales.reduce((sum, s) => sum + (s.amount_paid || 0), 0);
    const totalOutstanding = sales.reduce((sum, s) => sum + (s.outstanding_balance || 0), 0);

    return ok(res, { sales, totalRevenue, totalOutstanding, count: sales.length });
  } catch (err) {
    logger.error('[getSalesReport]', err);
    return fail(res, 500, 'Failed to generate sales report.');
  }
});

/**
 * GET /api/packages/reports/utilization
 */
router.get('/reports/utilization', authManager, async (req, res) => {
  try {
    const { ClientPackage, Package } = req.businessModels;
    const branchId = req.user.branchId;

    const stats = await ClientPackage.aggregate([
      { $match: { branchId } },
      {
        $group: {
          _id: '$package_id',
          total_sold: { $sum: 1 },
          total_sittings_issued: { $sum: '$total_sittings' },
          total_sittings_used: { $sum: '$used_sittings' },
          expired_unused: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'EXPIRED'] }, { $gt: ['$remaining_sittings', 0] }] },
                1, 0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: Package.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'package'
        }
      },
      { $unwind: { path: '$package', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          package_name: '$package.name',
          total_sold: 1,
          total_sittings_issued: 1,
          total_sittings_used: 1,
          expired_unused: 1,
          utilization_pct: {
            $cond: [
              { $gt: ['$total_sittings_issued', 0] },
              { $multiply: [{ $divide: ['$total_sittings_used', '$total_sittings_issued'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { total_sold: -1 } }
    ]);

    return ok(res, stats);
  } catch (err) {
    logger.error('[getUtilizationReport]', err);
    return fail(res, 500, 'Failed to generate utilization report.');
  }
});

/**
 * GET /api/packages/reports/expiring
 * Packages expiring within next N days (default 7)
 */
router.get('/reports/expiring', authManager, async (req, res) => {
  try {
    const { ClientPackage } = req.businessModels;
    const branchId = req.user.branchId;
    const days = parseInt(req.query.days) || 7;

    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const expiring = await ClientPackage.find({
      branchId,
      status: 'ACTIVE',
      expiry_date: { $ne: null, $gte: now, $lte: cutoff }
    })
      .populate('package_id', 'name type')
      .populate('client_id', 'name phone')
      .sort({ expiry_date: 1 })
      .lean();

    return ok(res, { expiring, count: expiring.length, days });
  } catch (err) {
    logger.error('[getExpiringReport]', err);
    return fail(res, 500, 'Failed to generate expiring report.');
  }
});

/**
 * POST /api/packages/reports/export
 * Export reports as PDF or Excel
 */
router.post('/reports/export', authManager, async (req, res) => {
  try {
    const { ClientPackage, Package } = req.businessModels;
    const branchId = req.user.branchId;
    const { format = 'excel', reportType = 'sales', from, to } = req.body;

    const match = { branchId };
    if (from || to) {
      match.purchase_date = {};
      if (from) match.purchase_date.$gte = new Date(from);
      if (to) match.purchase_date.$lte = new Date(to);
    }

    const rows = await ClientPackage.find(match)
      .populate('package_id', 'name type total_price')
      .populate('client_id', 'name phone')
      .sort({ purchase_date: -1 })
      .lean();

    if (format === 'excel') {
      const XLSX = require('xlsx');
      const data = rows.map(r => ({
        'Client': r.client_id?.name || '',
        'Phone': r.client_id?.phone || '',
        'Package': r.package_id?.name || '',
        'Type': r.package_id?.type || '',
        'Purchase Date': r.purchase_date ? new Date(r.purchase_date).toLocaleDateString() : '',
        'Expiry Date': r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : 'Never',
        'Sittings Total': r.total_sittings,
        'Sittings Used': r.used_sittings,
        'Sittings Left': r.remaining_sittings,
        'Amount Paid': r.amount_paid,
        'Outstanding': r.outstanding_balance,
        'Payment Status': r.payment_status,
        'Status': r.status
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Packages');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename=packages-report.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Disposition', 'attachment; filename=packages-report.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);

      doc.fontSize(16).text('EaseMySalon — Packages Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);

      rows.forEach((r, i) => {
        doc.text(
          `${i + 1}. ${r.client_id?.name || 'N/A'} | ${r.package_id?.name || 'N/A'} | ` +
          `Used: ${r.used_sittings}/${r.total_sittings} | Status: ${r.status} | ` +
          `Paid: ₹${r.amount_paid} | Balance: ₹${r.outstanding_balance}`
        );
      });

      doc.end();
      return;
    }

    return fail(res, 400, 'Unsupported format. Use "excel" or "pdf".');
  } catch (err) {
    logger.error('[exportReport]', err);
    return fail(res, 500, 'Failed to export report.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LAST BLOCK — wildcard /:id routes (ALWAYS at bottom)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/packages/:id
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { Package, PackageService, Service } = req.businessModels;
    const branchId = req.user.branchId;

    const pkg = await Package.findOne({ _id: req.params.id, branchId }).lean();
    if (!pkg) return fail(res, 404, 'Package not found.');

    const services = await PackageService.find({ package_id: pkg._id, branchId })
      .populate('service_id', 'name price category')
      .lean();

    return ok(res, { ...pkg, services });
  } catch (err) {
    logger.error('[getPackageById]', err);
    return fail(res, 500, 'Failed to fetch package.');
  }
});

/**
 * PUT /api/packages/:id
 * Edit package — only affects future purchases, never existing ClientPackages
 */
router.put('/:id', authManager, async (req, res) => {
  try {
    const { Package, PackageService, PackageAuditLog, ClientPackage } = req.businessModels;
    const branchId = req.user.branchId;

    const pkg = await Package.findOne({ _id: req.params.id, branchId });
    if (!pkg) return fail(res, 404, 'Package not found.');
    if (pkg.status === 'ARCHIVED') return fail(res, 409, 'Archived packages cannot be edited.');

    // Multi-branch / cross-branch: admin only
    if (req.body.branch_ids !== undefined && req.user.role !== 'admin') {
      return fail(res, 403, 'Only the salon owner can change branch assignments.', ['INSUFFICIENT_PERMISSIONS']);
    }
    if (req.body.cross_branch_redemption !== undefined && req.user.role !== 'admin') {
      return fail(res, 403, 'Only the salon owner can toggle cross-branch redemption.', ['INSUFFICIENT_PERMISSIONS']);
    }

    // Check for duplicate name (exclude self)
    if (req.body.name && req.body.name !== pkg.name) {
      const isDuplicate = await packageSvc.checkDuplicatePackageName(req.body.name, branchId, Package, req.params.id);
      if (isDuplicate) {
        return fail(res, 400, `A package named "${req.body.name}" already exists.`, ['DUPLICATE_NAME']);
      }
    }

    const oldValues = pkg.toObject();
    const {
      name, description, image_url, type,
      total_price, discount_amount, discount_type,
      min_service_count, max_service_count, total_sittings,
      validity_days, branch_ids, cross_branch_redemption,
      services
    } = req.body;

    // Apply updates
    if (name !== undefined) pkg.name = name.trim();
    if (description !== undefined) pkg.description = description;
    if (image_url !== undefined) pkg.image_url = image_url;
    if (type !== undefined) pkg.type = type;
    if (total_price !== undefined) pkg.total_price = total_price;
    if (discount_amount !== undefined) pkg.discount_amount = discount_amount;
    if (discount_type !== undefined) pkg.discount_type = discount_type;
    if (min_service_count !== undefined) pkg.min_service_count = min_service_count;
    if (max_service_count !== undefined) pkg.max_service_count = max_service_count;
    if (total_sittings !== undefined) pkg.total_sittings = total_sittings;
    if (validity_days !== undefined) pkg.validity_days = validity_days;
    if (branch_ids !== undefined) pkg.branch_ids = branch_ids;
    if (cross_branch_redemption !== undefined) pkg.cross_branch_redemption = cross_branch_redemption;
    await pkg.save();

    // Update services if provided
    if (services && Array.isArray(services)) {
      await PackageService.deleteMany({ package_id: pkg._id, branchId });
      const serviceDocs = services.map(s => ({
        branchId,
        package_id: pkg._id,
        service_id: s.service_id || s,
        is_optional: s.is_optional || false,
        tag: s.tag || null
      }));
      if (serviceDocs.length > 0) await PackageService.insertMany(serviceDocs);
    }

    await auditLog(PackageAuditLog, branchId, pkg._id, 'PACKAGE_UPDATED', req.user._id, oldValues, pkg.toObject());

    return ok(res, pkg, 'Package updated. Changes apply to future purchases only.');
  } catch (err) {
    logger.error('[updatePackage]', err);
    return fail(res, 500, 'Failed to update package.');
  }
});

/**
 * PATCH /api/packages/:id/status
 * Activate / Deactivate / Archive a package
 */
router.patch('/:id/status', authManager, async (req, res) => {
  try {
    const { Package, ClientPackage, PackageAuditLog } = req.businessModels;
    const branchId = req.user.branchId;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) {
      return fail(res, 400, 'Invalid status. Must be ACTIVE, INACTIVE, or ARCHIVED.');
    }

    const pkg = await Package.findOne({ _id: req.params.id, branchId });
    if (!pkg) return fail(res, 404, 'Package not found.');

    // Check active clients before archiving
    if (status === 'ARCHIVED') {
      const activeCount = await ClientPackage.countDocuments({
        branchId,
        package_id: pkg._id,
        status: 'ACTIVE'
      });
      if (activeCount > 0) {
        return fail(res, 409, `Cannot archive — ${activeCount} client(s) still have active subscriptions.`, ['ACTIVE_CLIENTS_EXIST']);
      }
    }

    const oldStatus = pkg.status;
    pkg.status = status;
    await pkg.save();

    await auditLog(PackageAuditLog, branchId, pkg._id, 'STATUS_CHANGED', req.user._id, { status: oldStatus }, { status });

    return ok(res, pkg, `Package ${status.toLowerCase()} successfully.`);
  } catch (err) {
    logger.error('[updatePackageStatus]', err);
    return fail(res, 500, 'Failed to update package status.');
  }
});

/**
 * DELETE /api/packages/:id
 * Soft delete (archive) — blocked if active client packages exist
 */
router.delete('/:id', authManager, async (req, res) => {
  try {
    const { Package, ClientPackage, PackageAuditLog } = req.businessModels;
    const branchId = req.user.branchId;

    const pkg = await Package.findOne({ _id: req.params.id, branchId });
    if (!pkg) return fail(res, 404, 'Package not found.');

    const activeCount = await ClientPackage.countDocuments({
      branchId,
      package_id: pkg._id,
      status: 'ACTIVE'
    });

    if (activeCount > 0) {
      return fail(res, 409, `Cannot delete — ${activeCount} client(s) still have active subscriptions.`, ['ACTIVE_CLIENTS_EXIST']);
    }

    pkg.status = 'ARCHIVED';
    await pkg.save();

    await auditLog(PackageAuditLog, branchId, pkg._id, 'PACKAGE_ARCHIVED', req.user._id, null, { status: 'ARCHIVED' });

    return ok(res, null, 'Package archived successfully.');
  } catch (err) {
    logger.error('[deletePackage]', err);
    return fail(res, 500, 'Failed to delete package.');
  }
});

/**
 * POST /api/packages/:id/sell
 * Sell a package to a client
 */
router.post('/:id/sell', auth, async (req, res) => {
  try {
    const { Package, ClientPackage, PackageAuditLog, Client } = req.businessModels;
    const branchId = req.user.branchId;

    const {
      client_id,
      amount_paid = 0,
      purchased_at_branch_id,
      sold_by_staff_id: soldByBody
    } = req.body;

    if (!client_id) return fail(res, 400, 'client_id is required.');

    const { Staff } = req.businessModels;
    let resolvedSoldBy = null;
    if (soldByBody && mongoose.Types.ObjectId.isValid(String(soldByBody))) {
      const s = await Staff.findOne({ _id: soldByBody, branchId }).select('_id').lean();
      if (s) resolvedSoldBy = s._id;
    }
    if (!resolvedSoldBy) {
      const u = await Staff.findOne({ _id: req.user._id, branchId }).select('_id').lean();
      if (u) resolvedSoldBy = u._id;
    }

    const pkg = await Package.findOne({ _id: req.params.id, branchId });
    if (!pkg) return fail(res, 404, 'Package not found.');
    if (pkg.status !== 'ACTIVE') return fail(res, 409, 'This package is not currently available for sale.');

    // Check if client already holds same active package (warn, not block)
    const existing = await ClientPackage.findOne({
      branchId,
      client_id,
      package_id: pkg._id,
      status: 'ACTIVE'
    }).lean();
    const duplicateWarning = existing
      ? 'Client already has an active subscription to this package.'
      : null;

    // Calculate expiry
    const purchaseDate = new Date();
    const expiryDate = packageSvc.calculateExpiryDate(purchaseDate, pkg.validity_days);

    // Resolve payment
    const paidAmount = parseFloat(amount_paid) || 0;
    const outstanding = Math.max(0, pkg.total_price - paidAmount);
    const paymentStatus = packageSvc.resolvePaymentStatus(paidAmount, pkg.total_price);

    const cp = await ClientPackage.create({
      branchId,
      client_id,
      package_id: pkg._id,
      purchase_date: purchaseDate,
      expiry_date: expiryDate,
      total_sittings: pkg.total_sittings,
      used_sittings: 0,
      remaining_sittings: pkg.total_sittings,
      payment_status: paymentStatus,
      amount_paid: paidAmount,
      outstanding_balance: outstanding,
      status: 'ACTIVE',
      purchased_at_branch_id: purchased_at_branch_id || branchId,
      ...(resolvedSoldBy && { sold_by_staff_id: resolvedSoldBy })
    });

    await auditLog(
      PackageAuditLog, branchId, pkg._id, 'PACKAGE_SOLD',
      req.user._id, null,
      { client_id, amount_paid: paidAmount, expiry_date: expiryDate }
    );

    const populated = await ClientPackage.findById(cp._id)
      .populate('package_id', 'name type total_price total_sittings validity_days')
      .populate('client_id', 'name phone')
      .populate('sold_by_staff_id', 'name')
      .lean();

    return ok(res, { clientPackage: populated, warning: duplicateWarning }, 'Package sold successfully.');
  } catch (err) {
    logger.error('[sellPackage]', err);
    return fail(res, 500, 'Failed to sell package.');
  }
});

module.exports = router;
