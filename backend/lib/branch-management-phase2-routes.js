/**
 * Phase 2 routes and extended per-branch queries for branch-management.
 */

const mongoose = require('mongoose');
const { z } = require('zod');
const {
  catalogKey,
  normalizePhone,
  availableMinutesInRange,
  pct,
  prorateRevenueTarget,
  deriveClientSegment,
  buildStaffRevenueMap,
  COMPLETED,
} = require('./branch-management-helpers');
const {
  toObjectId,
  normalizeStaffId,
  loadBranchOwnerStaff,
  distributeAppointmentBookedMinutes,
  computeBranchCapacityMetrics,
} = require('./branch-utilization');
const { getBusinessModel } = require('./get-all-branches');
const { executeInventoryTransfer } = require('./execute-inventory-transfer');
const { getTransferRequestModel } = require('./transfer-request-model');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

function getOwnerClientIndexModel(conn) {
  if (conn.models.OwnerClientIndex) return conn.models.OwnerClientIndex;
  return conn.model('OwnerClientIndex', require('../models/OwnerClientIndex').schema);
}

function getDailyMetricModel(conn) {
  if (conn.models.DailyMetric) return conn.models.DailyMetric;
  return conn.model('DailyMetric', require('../models/DailyMetric').schema);
}

/** Extend base summary with utilization + avg rating (tenant fan-out). */
async function extendedMetricsForBranch(ctx, range) {
  const metrics = await computeBranchCapacityMetrics(ctx, range);
  return {
    bookedMinutes: metrics.bookedMinutes,
    availableMinutes: metrics.availableMinutes,
    capacityUtilizationPct: metrics.capacityUtilizationPct,
    avgRating: metrics.avgRating,
  };
}

/**
 * Staff utilization = booked minutes ÷ available minutes in range (workSchedule).
 */
async function staffWithUtilizationForBranch({ models, branch, mainConnection }, range, includeInactive) {
  const { Staff, Sale, Appointment } = models;
  const { start, end } = range;
  const startStr = range.ymd(start);
  const endStr = range.ymd(end);
  const branchId = toObjectId(branch.id);

  // Always load all staff for name/role lookup; filter inactive rows at the end.
  const [staff, ownerStaff, sales, appts] = await Promise.all([
    Staff.find({}).select('name role isActive avatar workSchedule').lean(),
    loadBranchOwnerStaff(mainConnection, branch.id),
    Sale.find({ branchId, date: { $gte: start, $lte: end }, status: COMPLETED })
      .select('items')
      .lean(),
    Appointment.find({
      branchId,
      date: { $gte: startStr, $lte: endStr },
      status: COMPLETED,
    })
      .select('duration staffId staffAssignments date')
      .lean(),
  ]);

  const byStaff = new Map();
  /** Unique staff name → id (null when ambiguous). Used when bill staffId is stale/wrong. */
  const staffIdByUniqueName = new Map();

  const addStaffRecord = (record) => {
    byStaff.set(record.id, {
      id: record.id,
      name: record.name,
      role: record.role || 'staff',
      unlinked: false,
      isOwner: !!record.isOwner,
      isActive: record.isActive !== false,
      avatar: record.avatar || '',
      servicesDone: 0,
      revenue: 0,
      bookedMinutes: 0,
      workSchedule: record.workSchedule || [],
    });
    const nameKey = String(record.name || '').trim().toLowerCase();
    if (nameKey) {
      if (!staffIdByUniqueName.has(nameKey)) {
        staffIdByUniqueName.set(nameKey, record.id);
      } else {
        staffIdByUniqueName.set(nameKey, null);
      }
    }
  };

  if (ownerStaff) addStaffRecord(ownerStaff);

  for (const s of staff) {
    const sid = normalizeStaffId(s._id);
    if (byStaff.has(sid)) continue;
    addStaffRecord({
      id: sid,
      name: s.name,
      role: s.role || 'staff',
      isActive: s.isActive !== false,
      avatar: s.avatar || '',
      workSchedule: s.workSchedule,
    });
  }

  const resolveStaffKey = (id, nameHint) => {
    const key = normalizeStaffId(id);
    if (key && byStaff.has(key)) return key;
    const nameKey = String(nameHint || '').trim().toLowerCase();
    if (nameKey) {
      const byName = staffIdByUniqueName.get(nameKey);
      if (byName) return byName;
    }
    return key;
  };

  const ensure = (id, nameHint) => {
    const hintedName = String(nameHint || '').trim();
    const resolvedKey = resolveStaffKey(id, nameHint);
    if (resolvedKey && byStaff.has(resolvedKey)) {
      return byStaff.get(resolvedKey);
    }

    const orphanKey = resolvedKey || `orphan:${hintedName.toLowerCase() || 'unknown'}`;
    if (!byStaff.has(orphanKey)) {
      byStaff.set(orphanKey, {
        id: resolvedKey || orphanKey,
        name: hintedName || 'Unknown',
        role: '',
        unlinked: true,
        isActive: false,
        avatar: '',
        servicesDone: 0,
        revenue: 0,
        bookedMinutes: 0,
        workSchedule: [],
      });
    }
    return byStaff.get(orphanKey);
  };

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const lineType = String(item.type || '').toLowerCase();
      const qty = Number(item.quantity) || 1;
      const isService = lineType === 'service';

      if (item.staffContributions?.length) {
        const n = item.staffContributions.length;
        for (const c of item.staffContributions) {
          if (!c.staffId) continue;
          const rec = ensure(c.staffId, c.staffName);
          rec.revenue += c.amount || 0;
          if (isService) rec.servicesDone += qty / n;
        }
      } else if (item.staffId) {
        const rec = ensure(item.staffId, item.staffName);
        rec.revenue += item.total || 0;
        if (isService) rec.servicesDone += qty;
      }
    }
  }

  const { bookedByStaff } = distributeAppointmentBookedMinutes(appts);
  for (const [id, mins] of bookedByStaff) {
    ensure(id).bookedMinutes += mins;
  }

  return Array.from(byStaff.values())
    .filter((r) => includeInactive || r.isActive)
    .map((r) => {
      const available = availableMinutesInRange(r.workSchedule, start, end);
      return {
        id: r.id,
        name: r.name,
        role: r.role,
        unlinked: !!r.unlinked,
        isOwner: !!r.isOwner,
        isActive: r.isActive,
        avatar: r.avatar,
        servicesDone: Math.round(r.servicesDone * 1000) / 1000,
        revenue: Math.round(r.revenue),
        utilizationPct: pct(r.bookedMinutes, available),
      };
    });
}

async function staffCompareForBranch(ctx, range, metric) {
  if (metric === 'utilization') {
    range.ymd = range.ymd || require('./branch-management-helpers').ymd;
    const extra = await extendedMetricsForBranch(ctx, range);
    return extra.capacityUtilizationPct;
  }
  const staff = await staffWithUtilizationForBranch(ctx, range, true);
  if (metric === 'revenue') {
    return staff.reduce((s, r) => s + r.revenue, 0);
  }
  return staff.reduce((s, r) => s + r.servicesDone, 0);
}

async function topPerformersForBranch({ models, branch }, range) {
  const { Sale, Appointment } = models;
  const branchId = toObjectId(branch.id);
  const startStr = range.ymd(range.start);
  const endStr = range.ymd(range.end);

  const [sales, appts] = await Promise.all([
    Sale.find({ branchId, date: { $gte: range.start, $lte: range.end }, status: COMPLETED })
      .select('items')
      .lean(),
    Appointment.find({
      branchId,
      date: { $gte: startStr, $lte: endStr },
      status: COMPLETED,
    })
      .select('items serviceName duration')
      .lean(),
  ]);

  const serviceMap = new Map();
  for (const sale of sales) {
    for (const item of sale.items || []) {
      if (item.type !== 'service' && item.itemType !== 'service') continue;
      const name = item.name || item.serviceName || 'Service';
      const key = catalogKey(name, item.sku);
      const existing = serviceMap.get(key) || { name, count: 0, revenue: 0 };
      existing.count += item.quantity || 1;
      existing.revenue += item.total || 0;
      serviceMap.set(key, existing);
    }
  }

  const staffRows = [];
  for (const sale of sales) {
    for (const item of sale.items || []) {
      staffRows.push(item);
    }
  }
  const staffRev = buildStaffRevenueMap(staffRows);

  return {
    topServices: Array.from(serviceMap.values()),
    topStaff: Array.from(staffRev.values()).map((s) => ({
      name: s.staffName,
      revenue: Math.round(s.amount),
    })),
  };
}

async function inventoryMatrixExtendedForBranch({ models, branch }) {
  const { Product, InventoryTransaction } = models;
  const products = await Product.find({ isActive: true })
    .select('name category stock minimumStock sku _id')
    .sort({ name: 1 })
    .lean();

  const productIds = products.map((p) => p._id);
  const restockAgg = productIds.length
    ? await InventoryTransaction.aggregate([
        {
          $match: {
            productId: { $in: productIds },
            transactionType: 'restock',
          },
        },
        { $group: { _id: '$productId', lastRestockedAt: { $max: '$createdAt' } } },
      ])
    : [];

  const restockMap = new Map(
    restockAgg.map((r) => [String(r._id), r.lastRestockedAt])
  );

  return products.map((p) => ({
    productId: String(p._id),
    name: p.name,
    sku: p.sku || '',
    category: p.category || '',
    stock: p.stock || 0,
    reorderLevel: p.minimumStock != null ? p.minimumStock : 0,
    lastRestockedAt: restockMap.get(String(p._id)) || null,
  }));
}

async function clientsListForBranch({ models, branch }, filters) {
  const { Client } = models;
  const query = {};
  if (filters.search) {
    const safe = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: safe, $options: 'i' } }, { phone: { $regex: safe } }];
  }
  const clients = await Client.find(query)
    .select('name phone email lastVisit totalVisits totalSpent createdAt')
    .sort({ totalSpent: -1 })
    .limit(filters.limitPerBranch || 500)
    .lean();

  return clients.map((c) => ({
    branchId: branch.id,
    branchName: branch.name,
    id: String(c._id),
    name: c.name,
    phone: c.phone,
    email: c.email || '',
    lastVisit: c.lastVisit || null,
    totalVisits: c.totalVisits || 0,
    totalSpent: c.totalSpent || 0,
  }));
}

async function servicesForBranch({ models, branch }) {
  const { Service } = models;
  const services = await Service.find({ isActive: { $ne: false } })
    .select('name sku price duration category tier isActive')
    .sort({ name: 1 })
    .lean();
  return services.map((s) => ({
    id: String(s._id),
    name: s.name,
    sku: s.sku || '',
    price: s.price || 0,
    durationMinutes: s.duration || 30,
    category: s.category || '',
    tier: s.tier || 'standard',
    enabled: s.isActive !== false,
    key: catalogKey(s.name, s.sku),
  }));
}

function registerPhase2Routes(router, deps) {
  const {
    guard,
    validate,
    fanOut,
    resolveRange,
    ymd,
    stockStatus,
    rangeSchema,
    branchIdParamSchema,
    DAYS,
    normalizeHours,
  } = deps;

  /* ---- Extended GET /summary fields merged in handler ---- */
  router.get('/overview/top-performers', guard, validate(rangeSchema, 'query'), async (req, res) => {
    try {
      const range = resolveRange(req.query);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      range.ymd = ymd;

      const results = await fanOut(req.mainConnection, req.branchList, (ctx) =>
        topPerformersForBranch(ctx, range)
      );

      const serviceMap = new Map();
      const staffMap = new Map();
      for (const r of results) {
        if (!r.data) continue;
        for (const s of r.data.topServices || []) {
          const key = catalogKey(s.name, '');
          const ex = serviceMap.get(key) || { name: s.name, count: 0, revenue: 0 };
          ex.count += s.count;
          ex.revenue += s.revenue;
          serviceMap.set(key, ex);
        }
        for (const st of r.data.topStaff || []) {
          const key = st.name.toLowerCase();
          const ex = staffMap.get(key) || { name: st.name, revenue: 0 };
          ex.revenue += st.revenue;
          staffMap.set(key, ex);
        }
      }

      const topServices = Array.from(serviceMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit)
        .map((s) => ({ name: s.name, count: s.count, revenue: Math.round(s.revenue) }));

      const topStaff = Array.from(staffMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit)
        .map((s) => ({ name: s.name, revenue: s.revenue }));

      res.json({
        success: true,
        data: { topServices, topStaff, range: { from: ymd(range.start), to: ymd(range.end) } },
      });
    } catch (error) {
      logger.error('branch-management top-performers error:', error);
      res.status(500).json({ success: false, error: 'Failed to load top performers' });
    }
  });

  /* ---- GET /staff/compare ---- */
  const compareSchema = rangeSchema.extend({
    metric: z.enum(['revenue', 'services', 'utilization']).optional(),
  });

  router.get('/staff/compare', guard, validate(compareSchema, 'query'), async (req, res) => {
    try {
      const range = resolveRange(req.query);
      const metric = req.query.metric || 'revenue';
      range.ymd = ymd;

      const results = await fanOut(req.mainConnection, req.branchList, (ctx) =>
        staffCompareForBranch(ctx, range, metric)
      );

      res.json({
        success: true,
        data: {
          labels: results.map((r) => r.branchName),
          series: [
            {
              metric,
              data: results.map((r) => (r.error ? 0 : r.data || 0)),
            },
          ],
          branches: results.map((r) => ({
            branchId: r.branchId,
            branchName: r.branchName,
            error: r.error,
          })),
          range: { from: ymd(range.start), to: ymd(range.end) },
        },
      });
    } catch (error) {
      logger.error('branch-management staff compare error:', error);
      res.status(500).json({ success: false, error: 'Failed to load staff comparison' });
    }
  });

  /* ---- PATCH /inventory/reorder ---- */
  const reorderSchema = z
    .object({
      branchId: z.string().regex(/^[a-fA-F0-9]{24}$/),
      productKey: z.string().trim().min(1).max(200),
      minimumStock: z.number().int().min(0),
    })
    .strict();

  router.patch('/inventory/reorder', guard, validate(reorderSchema), async (req, res) => {
    try {
      const { branchId, productKey, minimumStock } = req.body;
      const branch = req.branchList.find((b) => String(b.id) === String(branchId));
      if (!branch) {
        return res.status(404).json({ success: false, error: 'Branch not found' });
      }

      const conn = await databaseManager.getConnection(branch.code, req.mainConnection);
      const { Product } = modelFactory.createBusinessModels(conn);

      const keyLower = productKey.toLowerCase();
      const products = await Product.find({ isActive: true }).select('name sku minimumStock').lean();
      const match = products.find(
        (p) => catalogKey(p.name, p.sku) === keyLower || String(p._id) === productKey
      );
      if (!match) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      await Product.updateOne({ _id: match._id }, { $set: { minimumStock } });

      res.json({
        success: true,
        data: { branchId, productKey, minimumStock },
        message: 'Reorder level updated',
      });
    } catch (error) {
      logger.error('branch-management reorder error:', error);
      res.status(500).json({ success: false, error: 'Failed to update reorder level' });
    }
  });

  /* ---- Transfer requests ---- */
  const transferListSchema = z.object({ status: z.string().optional() }).passthrough();

  router.get('/inventory/transfers', guard, validate(transferListSchema, 'query'), async (req, res) => {
    try {
      const TransferRequest = getTransferRequestModel(req.mainConnection);
      const filter = { ownerId: req.user._id };
      if (req.query.status) filter.status = req.query.status;
      const rows = await TransferRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ success: true, data: { transfers: rows } });
    } catch (error) {
      logger.error('branch-management transfers list error:', error);
      res.status(500).json({ success: false, error: 'Failed to load transfers' });
    }
  });

  const createTransferSchema = z
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

  router.post('/inventory/transfers', guard, validate(createTransferSchema), async (req, res) => {
    try {
      const { fromBranchId, toBranchId } = req.body;
      if (String(fromBranchId) === String(toBranchId)) {
        return res.status(400).json({ success: false, error: 'Source and destination branch must differ' });
      }
      const fromOk = req.branchList.some((b) => String(b.id) === String(fromBranchId));
      const toOk = req.branchList.some((b) => String(b.id) === String(toBranchId));
      if (!fromOk || !toOk) {
        return res.status(404).json({ success: false, error: 'Branch not found' });
      }

      const TransferRequest = getTransferRequestModel(req.mainConnection);
      const doc = await TransferRequest.create({
        ...req.body,
        ownerId: req.user._id,
        requestedBy: req.user._id,
        initiatedByBranchId: req.body.initiatedByBranchId || fromBranchId,
        status: 'pending',
      });
      res.status(201).json({ success: true, data: { transfer: doc } });
    } catch (error) {
      logger.error('branch-management transfer create error:', error);
      res.status(500).json({ success: false, error: 'Failed to create transfer request' });
    }
  });

  const patchTransferSchema = z
    .object({
      status: z.enum(['approved', 'rejected', 'cancelled']),
      notes: z.string().max(500).optional(),
    })
    .strict();

  router.patch(
    '/inventory/transfers/:id',
    guard,
    validate(z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/) }).strict(), 'params'),
    validate(patchTransferSchema),
    async (req, res) => {
      try {
        const TransferRequest = getTransferRequestModel(req.mainConnection);
        const transfer = await TransferRequest.findOne({
          _id: req.params.id,
          ownerId: req.user._id,
        });
        if (!transfer) {
          return res.status(404).json({ success: false, error: 'Transfer not found' });
        }
        if (transfer.status !== 'pending') {
          return res.status(409).json({ success: false, error: 'Transfer already processed' });
        }

        const { status, notes } = req.body;
        if (status === 'cancelled') {
          transfer.status = 'cancelled';
          transfer.reviewedBy = req.user._id;
          if (notes) transfer.notes = notes;
          await transfer.save();
          return res.json({ success: true, data: { transfer } });
        }

        if (status === 'rejected') {
          transfer.status = 'rejected';
          transfer.reviewedBy = req.user._id;
          if (notes) transfer.notes = notes;
          await transfer.save();
          return res.json({ success: true, data: { transfer } });
        }

        // Approve: execute stock transfer in both tenant DBs
        const result = await executeInventoryTransfer({
          mainConnection: req.mainConnection,
          transfer,
          branchList: req.branchList,
          processedBy: req.user.email || req.user.firstName || 'System',
        });

        if (result.ok) {
          transfer.status = 'completed';
          transfer.completedAt = new Date();
        } else {
          transfer.status = 'pending';
          transfer.notes = (transfer.notes || '') + (result.errors[0] ? ` Execution failed: ${result.errors[0]}` : '');
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

        res.json({
          success: true,
          data: { transfer },
        });
      } catch (error) {
        logger.error('branch-management transfer patch error:', error);
        res.status(500).json({ success: false, error: 'Failed to update transfer' });
      }
    }
  );

  /* ---- GET /clients ---- */
  const clientsListSchema = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      branchId: z.string().optional(),
      segment: z.enum(['new', 'returning', 'vip', 'at_risk', 'all']).optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .passthrough();

  router.get('/clients', guard, validate(clientsListSchema, 'query'), async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 25;
      const segment = req.query.segment || 'all';
      const search = (req.query.search || '').trim();

      let branchList = req.branchList;
      if (req.query.branchId) {
        branchList = branchList.filter((b) => String(b.id) === String(req.query.branchId));
      }

      const Business = getBusinessModel(req.mainConnection);
      const businessDocs = await Business.find({
        _id: { $in: branchList.map((b) => b.id) },
        owner: req.user._id,
      })
        .select('settings.appointmentSettings.allowCrossBranchBooking')
        .lean();
      const crossBranchByBranch = new Map(
        businessDocs.map((b) => [
          String(b._id),
          b.settings?.appointmentSettings?.allowCrossBranchBooking === true,
        ])
      );

      const OwnerClientIndex = getOwnerClientIndexModel(req.mainConnection);
      const indexed = search
        ? []
        : await OwnerClientIndex.find({ ownerId: req.user._id }).limit(5000).lean();

      const indexedByPhone = new Map(indexed.map((r) => [normalizePhone(r.phone), r]));

      const results = await fanOut(req.mainConnection, branchList, (ctx) =>
        clientsListForBranch(ctx, { search, limitPerBranch: 300 })
      );

      const merged = new Map();
      for (const r of results) {
        if (!r.data) continue;
        for (const c of r.data) {
          const phone = normalizePhone(c.phone);
          if (!phone) continue;
          const existing = merged.get(phone) || {
            phone: c.phone,
            name: c.name,
            email: c.email,
            branches: [],
            totalVisits: 0,
            totalSpent: 0,
            lastVisit: null,
          };
          existing.branches.push({
            branchId: c.branchId,
            branchName: c.branchName,
            clientId: c.id,
            totalVisits: c.totalVisits,
            totalSpent: c.totalSpent,
            lastVisit: c.lastVisit,
          });
          existing.totalVisits += c.totalVisits;
          existing.totalSpent += c.totalSpent;
          if (
            c.lastVisit &&
            (!existing.lastVisit || new Date(c.lastVisit) > new Date(existing.lastVisit))
          ) {
            existing.lastVisit = c.lastVisit;
          }
          if (!existing.name && c.name) existing.name = c.name;
          merged.set(phone, existing);
        }
      }

      let rows = Array.from(merged.values()).map((row) => {
        let homeBranchId = indexedByPhone.get(normalizePhone(row.phone))?.homeBranchId || null;
        if (!homeBranchId && row.branches.length) {
          const best = row.branches.reduce((a, b) =>
            b.totalVisits > a.totalVisits ||
            (b.totalVisits === a.totalVisits && b.totalSpent > a.totalSpent)
              ? b
              : a
          );
          homeBranchId = best.branchId;
        }
        const homeBranchIdStr = homeBranchId ? String(homeBranchId) : null;
        const vipThreshold = 50000;
        const seg = deriveClientSegment(row.totalVisits, row.totalSpent, row.lastVisit, vipThreshold);
        return {
          ...row,
          homeBranchId: homeBranchIdStr,
          segment: seg,
          allowCrossBranchBooking: homeBranchIdStr
            ? crossBranchByBranch.get(homeBranchIdStr) === true
            : false,
        };
      });

      if (segment !== 'all') {
        rows = rows.filter((r) => r.segment === segment);
      }
      rows.sort((a, b) => b.totalSpent - a.totalSpent);

      const total = rows.length;
      const start = (page - 1) * limit;
      const pageRows = rows.slice(start, start + limit);

      res.json({
        success: true,
        data: {
          clients: pageRows,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      });
    } catch (error) {
      logger.error('branch-management clients list error:', error);
      res.status(500).json({ success: false, error: 'Failed to load clients' });
    }
  });

  /* ---- Branch services ---- */
  router.get(
    '/branches/:branchId/services',
    guard,
    validate(branchIdParamSchema, 'params'),
    async (req, res) => {
      try {
        const { branchId } = req.params;
        const branch = req.branchList.find((b) => String(b.id) === branchId);
        if (!branch) {
          return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        const Business = getBusinessModel(req.mainConnection);
        const biz = await Business.findOne({ _id: branchId, owner: req.user._id })
          .select('settings.serviceOverrides')
          .lean();
        const overrides = biz?.settings?.serviceOverrides || {};

        const results = await fanOut(req.mainConnection, [branch], servicesForBranch);
        const {
          applyOverridesToServiceDoc,
        } = require('./apply-service-overrides');
        const services = (results[0]?.data || []).map((s) => {
          const merged = applyOverridesToServiceDoc(
            {
              name: s.name,
              sku: s.sku,
              price: s.price,
              duration: s.durationMinutes,
              tier: s.tier,
              isActive: s.enabled,
            },
            overrides
          );
          return {
            ...s,
            enabled: merged.isActive !== false,
            durationMinutes: merged.duration ?? s.durationMinutes,
            price: merged.price ?? s.price,
            tier: merged.tier || s.tier,
            hasOverride: Boolean(overrides[s.key]),
          };
        });

        res.json({ success: true, data: { services } });
      } catch (error) {
        logger.error('branch-management services get error:', error);
        res.status(500).json({ success: false, error: 'Failed to load services' });
      }
    }
  );

  const patchServicesSchema = z
    .object({
      overrides: z.record(
        z.string(),
        z
          .object({
            enabled: z.boolean().optional(),
            durationMinutes: z.number().int().min(5).optional(),
            price: z.number().min(0).optional(),
            tier: z.enum(['standard', 'premium']).optional(),
          })
          .strict()
      ),
    })
    .strict();

  router.patch(
    '/branches/:branchId/services',
    guard,
    validate(branchIdParamSchema, 'params'),
    validate(patchServicesSchema),
    async (req, res) => {
      try {
        const { branchId } = req.params;
        const Business = getBusinessModel(req.mainConnection);
        const branch = await Business.findOne({ _id: branchId, owner: req.user._id });
        if (!branch) {
          return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        branch.settings = branch.settings || {};
        const current = branch.settings.serviceOverrides || {};
        branch.settings.serviceOverrides = { ...current, ...req.body.overrides };
        branch.updatedAt = new Date();
        await branch.save();

        res.json({
          success: true,
          data: { serviceOverrides: branch.settings.serviceOverrides },
          message: 'Service overrides saved',
        });
      } catch (error) {
        logger.error('branch-management services patch error:', error);
        res.status(500).json({ success: false, error: 'Failed to save service overrides' });
      }
    }
  );

  const copyServicesSchema = z
    .object({
      sourceBranchId: z.string().min(1),
      includeCatalog: z.boolean().optional().default(true),
      includeOverrides: z.boolean().optional().default(true),
      onConflict: z.enum(['skip', 'update']).optional().default('skip'),
    })
    .strict();

  router.post(
    '/branches/:branchId/services/copy',
    guard,
    validate(branchIdParamSchema, 'params'),
    validate(copyServicesSchema),
    async (req, res) => {
      try {
        const targetBranchId = req.params.branchId;
        const { sourceBranchId, includeCatalog, includeOverrides, onConflict } = req.body;

        const targetBranch = req.branchList.find((b) => String(b.id) === targetBranchId);
        const sourceBranch = req.branchList.find((b) => String(b.id) === sourceBranchId);
        if (!targetBranch) {
          return res.status(404).json({ success: false, error: 'Destination branch not found' });
        }
        if (!sourceBranch) {
          return res.status(404).json({ success: false, error: 'Source branch not found' });
        }

        const { copyBranchServices } = require('./copy-branch-services');
        const summary = await copyBranchServices({
          mainConnection: req.mainConnection,
          sourceBranch,
          targetBranch,
          ownerId: req.user._id,
          includeCatalog,
          includeOverrides,
          onConflict,
        });

        res.json({
          success: true,
          data: summary,
          message: 'Services copied successfully',
        });
      } catch (error) {
        logger.error('branch-management services copy error:', error);
        const status = error.message?.includes('must be different') ? 400 : 500;
        res.status(status).json({
          success: false,
          error: error.message || 'Failed to copy services',
        });
      }
    }
  );
}

module.exports = {
  registerPhase2Routes,
  extendedMetricsForBranch,
  staffWithUtilizationForBranch,
  inventoryMatrixExtendedForBranch,
  getTransferRequestModel,
  getOwnerClientIndexModel,
  getDailyMetricModel,
  prorateRevenueTarget,
};
