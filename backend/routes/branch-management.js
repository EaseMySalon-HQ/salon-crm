/**
 * Multi-branch admin surface — /api/branch-management/*
 *
 * All routes are owner-only and require 2+ active branches (see
 * middleware/requireMultiBranch.js). Read endpoints fan out across every active
 * branch's tenant DB and aggregate; write endpoints (add / status) operate on the
 * main Business collection. Mutating routes are covered by the global CSRF stack.
 */

const express = require('express');
const { z } = require('zod');
const { authenticateToken } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const { loadEntitlements } = require('../middleware/feature-gate');
const { gate, FEATURE } = require('../config/feature-routes');
const { requireMultiBranchAdmin } = require('../middleware/requireMultiBranch');
const { validate } = require('../middleware/validate');
const { fanOut } = require('../lib/branch-fanout');
const {
  getAllBranchesForOwner,
  getBusinessModel,
} = require('../lib/get-all-branches');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { generateNextBusinessCode } = require('../lib/generate-business-code');
const { logger } = require('../utils/logger');
const {
  registerPhase2Routes,
  staffWithUtilizationForBranch,
  inventoryMatrixExtendedForBranch,
  prorateRevenueTarget,
} = require('../lib/branch-management-phase2-routes');
const {
  aggregateDailyRows,
  resolveAllBranchesDailyRows,
  resolveBranchSeriesFromCache,
  pointInTimeCountsForBranch,
} = require('../lib/daily-metrics-cache');
const { catalogKey, pct } = require('../lib/branch-management-helpers');

const router = express.Router();

// Every route in this module shares the same gate.
const guard = [
  authenticateToken,
  setupMainDatabase,
  loadEntitlements,
  gate(FEATURE.MULTI_LOCATION),
  requireMultiBranchAdmin,
];

const TZ = 'Asia/Kolkata';
const COMPLETED = { $regex: /^completed$/i };

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Monday-based start of the ISO week containing `d`. */
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Bucket key for a Date, matching buildBucketsForRange() key derivation. */
function bucketKeyOf(date, period) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  if (period === 'weekly') return ymd(startOfWeek(d));
  if (period === 'monthly') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return ymd(d);
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date, or null when malformed. */
function parseYmd(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Resolve an explicit {start,end} range from the request query (?from&to, both
 * 'YYYY-MM-DD'), defaulting to the current calendar month when absent/invalid.
 */
function resolveRange(query) {
  const from = parseYmd(query && query.from);
  const to = parseYmd(query && query.to);
  if (from && to && from <= to) {
    return {
      start: from,
      end: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999),
    };
  }
  return { start: startOfMonth(), end: endOfMonth() };
}

/** Choose a bucket granularity proportional to the range span. */
function granularityForRange(start, end) {
  const days = Math.round((end - start) / 86400000) + 1;
  if (days <= 45) return 'daily';
  if (days <= 100) return 'weekly';
  return 'monthly';
}

/** Ordered buckets spanning [start, end] at the given granularity. */
function buildBucketsForRange(start, end, granularity) {
  const buckets = [];
  if (granularity === 'monthly') {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      buckets.push({
        key: `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`,
        label: `${MONTHS[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else if (granularity === 'weekly') {
    const cur = startOfWeek(start);
    while (cur <= end) {
      buckets.push({ key: ymd(cur), label: `${pad(cur.getDate())}/${pad(cur.getMonth() + 1)}` });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cur <= end) {
      buckets.push({ key: ymd(cur), label: `${pad(cur.getDate())}/${pad(cur.getMonth() + 1)}` });
      cur.setDate(cur.getDate() + 1);
    }
  }
  return buckets;
}

/* ------------------------------------------------------------------ */
/* Per-branch query builders (run inside fanOut against tenant DBs)    */
/* ------------------------------------------------------------------ */

async function summaryForBranch({ models, branch }, range) {
  const { Sale, Appointment, Staff, Client } = models;
  const { start, end } = range;
  const startStr = ymd(start);
  const endStr = ymd(end);
  const branchId = toObjectId(branch.id);

  const [revenueAgg, appointments, completedAppointments, staff, clients] = await Promise.all([
    Sale.aggregate([
      { $match: { branchId, date: { $gte: start, $lte: end }, status: COMPLETED } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
    ]),
    Appointment.countDocuments({
      branchId,
      date: { $gte: startStr, $lte: endStr },
      status: { $ne: 'cancelled' },
    }),
    Appointment.countDocuments({
      branchId,
      date: { $gte: startStr, $lte: endStr },
      status: COMPLETED,
    }),
    Staff.countDocuments({ isActive: true }),
    Client.countDocuments({}),
  ]);

  const revenue = revenueAgg[0]?.total || 0;
  return {
    revenue,
    appointments,
    completedAppointments,
    avgTicketSize: completedAppointments > 0 ? Math.round(revenue / completedAppointments) : 0,
    staff,
    clients,
    city: branch.city || '',
    status: branch.status || 'active',
  };
}

async function revenueSeriesForBranch({ models, branch }, range, granularity) {
  const { Sale } = models;
  const sales = await Sale.find({
    branchId: toObjectId(branch.id),
    date: { $gte: range.start, $lte: range.end },
    status: COMPLETED,
  })
    .select('date grossTotal')
    .lean();

  const map = {};
  for (const s of sales) {
    const key = bucketKeyOf(s.date, granularity);
    if (!key) continue;
    map[key] = (map[key] || 0) + (s.grossTotal || 0);
  }
  return map;
}

async function appointmentSeriesForBranch({ models, branch }, range, granularity) {
  const { Appointment } = models;
  const startStr = ymd(range.start);
  const endStr = ymd(range.end);
  const appts = await Appointment.find({
    branchId: toObjectId(branch.id),
    date: { $gte: startStr, $lte: endStr },
    status: { $ne: 'cancelled' },
  })
    .select('date')
    .lean();

  const map = {};
  for (const a of appts) {
    // Appointment.date is a 'YYYY-MM-DD' string.
    const key = bucketKeyOf(`${a.date}T00:00:00`, granularity);
    if (!key) continue;
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

async function staffForBranch({ models, branch, mainConnection }, range, includeInactive = true) {
  range.ymd = ymd;
  return staffWithUtilizationForBranch({ models, branch, mainConnection }, range, includeInactive);
}

async function inventoryForBranch({ models }) {
  const { Product } = models;
  const products = await Product.find({ isActive: true })
    .select('name category stock minimumStock')
    .sort({ name: 1 })
    .lean();

  return products.map((p) => {
    const reorderLevel = p.minimumStock != null ? p.minimumStock : 0;
    const currentStock = p.stock || 0;
    return {
      id: String(p._id),
      name: p.name,
      category: p.category || '',
      currentStock,
      reorderLevel,
      lowStock: currentStock <= reorderLevel,
    };
  });
}

async function inventoryMatrixForBranch(ctx) {
  return inventoryMatrixExtendedForBranch(ctx);
}

/** Colour band for a stock count relative to its reorder level. */
function stockStatus(stock, reorder) {
  if (stock <= 0) return 'zero';
  if (reorder <= 0) return 'green';
  if (stock <= reorder) return 'red';
  if (stock <= reorder * 2) return 'amber';
  return 'green';
}

async function clientSearchForBranch({ models }, phone) {
  const { Client, MembershipSubscription, MembershipPlan, MembershipUsage } = models;
  const safe = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const client = await Client.findOne({ phone: { $regex: safe } })
    .select('name phone email lastVisit totalVisits totalSpent')
    .lean();

  if (!client) return { found: false, client: null, memberships: [] };

  const subs = await MembershipSubscription.find({ customerId: client._id, status: 'ACTIVE' })
    .select('planId startDate expiryDate')
    .lean();

  const memberships = [];
  for (const sub of subs) {
    const plan = await MembershipPlan.findById(sub.planId)
      .select('planName price includedServices')
      .lean();
    const totalAllowed = (plan?.includedServices || []).reduce((sum, s) => sum + (s.usageLimit || 0), 0);
    const used = await MembershipUsage.countDocuments({ subscriptionId: sub._id });
    memberships.push({
      id: String(sub._id),
      planName: plan?.planName || 'Membership',
      startDate: sub.startDate,
      expiryDate: sub.expiryDate,
      remainingSessions: totalAllowed > 0 ? Math.max(0, totalAllowed - used) : null,
    });
  }

  return {
    found: true,
    client: {
      id: String(client._id),
      name: client.name,
      phone: client.phone,
      email: client.email || '',
      lastVisit: client.lastVisit || null,
      totalVisits: client.totalVisits || 0,
      totalSpent: client.totalSpent || 0,
    },
    memberships,
  };
}

function toObjectId(id) {
  const mongoose = require('mongoose');
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return id;
  }
}

/* ------------------------------------------------------------------ */
/* Shared query schema (date range) for read endpoints                 */
/* ------------------------------------------------------------------ */

const rangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    includeInactive: z
      .enum(['true', 'false', '1', '0'])
      .optional()
      .transform((v) => (v == null ? true : v === 'true' || v === '1')),
  })
  .passthrough();

/* ------------------------------------------------------------------ */
/* GET /summary                                                        */
/* ------------------------------------------------------------------ */

router.get('/summary', guard, validate(rangeSchema, 'query'), async (req, res) => {
  try {
    const range = resolveRange(req.query);
    range.ymd = ymd;

    const [dailyResolved, countResults, businessDocs] = await Promise.all([
      resolveAllBranchesDailyRows(req.mainConnection, req.branchList, range, ymd),
      fanOut(req.mainConnection, req.branchList, pointInTimeCountsForBranch),
      getBusinessModel(req.mainConnection)
        .find({ _id: { $in: req.branchList.map((b) => b.id) }, owner: req.user._id })
        .select('settings.revenueTarget')
        .lean(),
    ]);

    const { rowsByBranch, fetchErrors, cacheCoverage } = dailyResolved;
    const countsByBranch = new Map(
      countResults.map((r) => [r.branchId, r.data || { staff: 0, clients: 0 }])
    );
    const branchMeta = new Map(req.branchList.map((b) => [b.id, b]));

    const targetByBranch = new Map(
      businessDocs.map((b) => [String(b._id), b.settings?.revenueTarget?.monthly || 0])
    );

    const aggregate = {
      revenue: 0,
      appointments: 0,
      completedAppointments: 0,
      avgTicketSize: 0,
      staff: 0,
      clients: 0,
      bookedMinutes: 0,
      availableMinutes: 0,
      capacityUtilizationPct: 0,
      avgRating: null,
      revenueTarget: 0,
      revenueVsTargetPct: 0,
    };
    let ratingSum = 0;
    let ratingCount = 0;

    const branches = req.branchList.map((branch) => {
      const rows = rowsByBranch.get(branch.id) || [];
      const metrics = aggregateDailyRows(rows);
      const counts = countsByBranch.get(branch.id) || { staff: 0, clients: 0 };
      const fetchError = fetchErrors.get(branch.id);
      const countError = countResults.find((r) => r.branchId === branch.id)?.error;

      const d = {
        ...metrics,
        staff: counts.staff,
        clients: counts.clients,
        city: branch.city || '',
        status: branch.status || 'active',
      };
      const monthlyTarget = targetByBranch.get(branch.id) || 0;
      const revenueTarget = prorateRevenueTarget(monthlyTarget, range.start, range.end);
      const revenueVsTargetPct =
        revenueTarget > 0 ? Math.round((d.revenue / revenueTarget) * 100) : null;

      if (!fetchError) {
        aggregate.revenue += d.revenue;
        aggregate.appointments += d.appointments;
        aggregate.completedAppointments += d.completedAppointments;
        aggregate.staff += d.staff;
        aggregate.clients += d.clients;
        aggregate.revenueTarget += revenueTarget;
        aggregate.bookedMinutes += d.bookedMinutes || 0;
        aggregate.availableMinutes += d.availableMinutes || 0;
        if (d.avgRating != null) {
          ratingSum += d.avgRating;
          ratingCount += 1;
        }
      }

      return {
        branchId: branch.id,
        branchName: branch.name || branchMeta.get(branch.id)?.name || '',
        city: d.city,
        status: d.status,
        revenue: d.revenue,
        appointments: d.appointments,
        completedAppointments: d.completedAppointments,
        avgTicketSize: d.avgTicketSize,
        staff: d.staff,
        clients: d.clients,
        capacityUtilizationPct: d.capacityUtilizationPct || 0,
        avgRating: d.avgRating,
        revenueTarget,
        revenueVsTargetPct,
        error: fetchError || countError || null,
      };
    });

    aggregate.avgTicketSize =
      aggregate.completedAppointments > 0
        ? Math.round(aggregate.revenue / aggregate.completedAppointments)
        : 0;
    aggregate.revenueVsTargetPct =
      aggregate.revenueTarget > 0
        ? Math.round((aggregate.revenue / aggregate.revenueTarget) * 100)
        : null;
    aggregate.avgRating =
      ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;

    aggregate.capacityUtilizationPct = pct(
      aggregate.bookedMinutes,
      aggregate.availableMinutes
    );

    res.json({
      success: true,
      data: {
        aggregate,
        branches,
        range: { from: ymd(range.start), to: ymd(range.end) },
        cacheCoverage,
      },
    });
  } catch (error) {
    logger.error('branch-management summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to load summary' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /revenue?period=daily|weekly|monthly                           */
/* ------------------------------------------------------------------ */

router.get('/revenue', guard, validate(rangeSchema, 'query'), async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const granularity = granularityForRange(range.start, range.end);
    const buckets = buildBucketsForRange(range.start, range.end, granularity);

    const { series, cacheCoverage } = await resolveBranchSeriesFromCache(
      req.mainConnection,
      req.branchList,
      range,
      granularity,
      buckets,
      bucketKeyOf,
      'revenue',
      ymd
    );

    res.json({
      success: true,
      data: { labels: buckets.map((b) => b.label), series, granularity, cacheCoverage },
    });
  } catch (error) {
    logger.error('branch-management revenue error:', error);
    res.status(500).json({ success: false, error: 'Failed to load revenue' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /appointments?period=daily|weekly|monthly                      */
/* ------------------------------------------------------------------ */

router.get('/appointments', guard, validate(rangeSchema, 'query'), async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const granularity = granularityForRange(range.start, range.end);
    const buckets = buildBucketsForRange(range.start, range.end, granularity);

    const { series, cacheCoverage } = await resolveBranchSeriesFromCache(
      req.mainConnection,
      req.branchList,
      range,
      granularity,
      buckets,
      bucketKeyOf,
      'appointments',
      ymd
    );

    res.json({
      success: true,
      data: { labels: buckets.map((b) => b.label), series, granularity, cacheCoverage },
    });
  } catch (error) {
    logger.error('branch-management appointments error:', error);
    res.status(500).json({ success: false, error: 'Failed to load appointments' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /staff                                                          */
/* ------------------------------------------------------------------ */

router.get('/staff', guard, validate(rangeSchema, 'query'), async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const includeInactive = req.query.includeInactive !== false;
    const results = await fanOut(req.mainConnection, req.branchList, (ctx) =>
      staffForBranch({ ...ctx, mainConnection: req.mainConnection }, range, includeInactive)
    );
    const branches = results.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      error: r.error,
      staff: r.data || [],
    }));
    res.json({
      success: true,
      data: { branches, range: { from: ymd(range.start), to: ymd(range.end) } },
    });
  } catch (error) {
    logger.error('branch-management staff error:', error);
    res.status(500).json({ success: false, error: 'Failed to load staff' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /inventory                                                      */
/* ------------------------------------------------------------------ */

router.get('/inventory', guard, async (req, res) => {
  try {
    const results = await fanOut(req.mainConnection, req.branchList, inventoryForBranch);
    const branches = results.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      error: r.error,
      products: r.data || [],
    }));
    res.json({ success: true, data: { branches } });
  } catch (error) {
    logger.error('branch-management inventory error:', error);
    res.status(500).json({ success: false, error: 'Failed to load inventory' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /inventory/matrix  (products x branches stock grid)            */
/* ------------------------------------------------------------------ */

router.get('/inventory/matrix', guard, async (req, res) => {
  try {
    const results = await fanOut(req.mainConnection, req.branchList, inventoryMatrixForBranch);
    const branchMeta = results.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      error: r.error,
    }));

    // Merge the same product across branches by SKU when present, else by
    // normalized name. Branches that don't carry a product simply omit the cell.
    const productMap = new Map();
    for (const r of results) {
      if (!r.data) continue;
      for (const p of r.data) {
        const key = catalogKey(p.name, p.sku);
        if (!productMap.has(key)) {
          productMap.set(key, { key, name: p.name, sku: p.sku, category: p.category, branches: {} });
        }
        const entry = productMap.get(key);
        if (!entry.category && p.category) entry.category = p.category;
        if (!entry.sku && p.sku) entry.sku = p.sku;
        entry.branches[r.branchId] = {
          stock: p.stock,
          reorderLevel: p.reorderLevel,
          status: stockStatus(p.stock, p.reorderLevel),
          lastRestockedAt: p.lastRestockedAt || null,
        };
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: { branches: branchMeta, products } });
  } catch (error) {
    logger.error('branch-management inventory matrix error:', error);
    res.status(500).json({ success: false, error: 'Failed to load inventory matrix' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /clients/search?phone=XXXXX                                     */
/* ------------------------------------------------------------------ */

const clientSearchSchema = z
  .object({ phone: z.string().trim().min(4).max(20) })
  .passthrough();

router.get('/clients/search', guard, validate(clientSearchSchema, 'query'), async (req, res) => {
  try {
    const phone = req.query.phone;
    const results = await fanOut(req.mainConnection, req.branchList, (ctx) =>
      clientSearchForBranch(ctx, phone)
    );

    const branches = results.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      error: r.error,
      found: r.data?.found || false,
      client: r.data?.client || null,
      memberships: r.data?.memberships || [],
    }));

    // Home branch = where the client has the most visits (ties: highest spend).
    let homeBranchId = null;
    let best = { visits: -1, spent: -1 };
    for (const b of branches) {
      if (!b.found || !b.client) continue;
      const visits = b.client.totalVisits || 0;
      const spent = b.client.totalSpent || 0;
      if (visits > best.visits || (visits === best.visits && spent > best.spent)) {
        best = { visits, spent };
        homeBranchId = b.branchId;
      }
    }

    res.json({ success: true, data: { query: phone, homeBranchId, branches } });
  } catch (error) {
    logger.error('branch-management client search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search clients' });
  }
});

/* ------------------------------------------------------------------ */
/* GET/PATCH /org-settings  (owner-wide multi-location preferences)    */
/* ------------------------------------------------------------------ */

const orgSettingsPatchSchema = z
  .object({
    shareClientsAcrossBranches: z.boolean(),
  })
  .strict();

router.get('/org-settings', guard, async (req, res) => {
  try {
    const { getShareClientsAcrossBranches } = require('../lib/share-clients-across-branches');
    const shareClientsAcrossBranches = await getShareClientsAcrossBranches(
      req.mainConnection,
      req.user._id
    );
    res.json({
      success: true,
      data: { shareClientsAcrossBranches },
    });
  } catch (error) {
    logger.error('branch-management org-settings get error:', error);
    res.status(500).json({ success: false, error: 'Failed to load organization settings' });
  }
});

router.patch('/org-settings', guard, validate(orgSettingsPatchSchema), async (req, res) => {
  try {
    const { setShareClientsAcrossBranches } = require('../lib/share-clients-across-branches');
    const modified = await setShareClientsAcrossBranches(
      req.mainConnection,
      req.user._id,
      req.body.shareClientsAcrossBranches
    );
    res.json({
      success: true,
      data: {
        shareClientsAcrossBranches: req.body.shareClientsAcrossBranches,
        branchesUpdated: modified,
      },
      message: req.body.shareClientsAcrossBranches
        ? 'Clients are now shared across all branches'
        : 'Each branch now uses its own client list only',
    });
  } catch (error) {
    logger.error('branch-management org-settings patch error:', error);
    res.status(500).json({ success: false, error: 'Failed to save organization settings' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /branches  (settings list — includes inactive)                 */
/* ------------------------------------------------------------------ */

router.get('/branches', guard, async (req, res) => {
  try {
    const branches = await getAllBranchesForOwner(req.mainConnection, req.user._id);
    const managerName =
      `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || '';
    res.json({
      success: true,
      data: {
        branches: branches.map((b) => ({
          ...b,
          managerName,
          isActive: b.status === 'active',
          isCurrent: String(b.id) === String(req.user.branchId),
        })),
      },
    });
  } catch (error) {
    logger.error('branch-management list error:', error);
    res.status(500).json({ success: false, error: 'Failed to load branches' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /branches/add                                                  */
/* ------------------------------------------------------------------ */

const addBranchSchema = z
  .object({
    branchName: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(4).max(20),
    address: z.string().trim().min(1).max(300),
    state: z.string().trim().max(120).optional(),
    zipCode: z.string().trim().max(20).optional(),
    email: z.string().trim().email().max(320).optional(),
    managerId: z.string().trim().max(64).optional(),
  })
  .strict();

router.post('/branches/add', guard, validate(addBranchSchema), async (req, res) => {
  try {
    const { branchName, city, phone, address, state, zipCode, email } = req.body;
    const Business = getBusinessModel(req.mainConnection);

    const businessCode = await generateNextBusinessCode(Business);

    const { getShareClientsAcrossBranches } = require('../lib/share-clients-across-branches');
    const shareClientsAcrossBranches = await getShareClientsAcrossBranches(
      req.mainConnection,
      req.user._id
    );

    const business = new Business({
      code: businessCode,
      name: branchName,
      businessType: 'salon',
      address: {
        street: address,
        city,
        state: state || 'NA',
        zipCode: zipCode || 'NA',
        country: 'India',
      },
      contact: {
        phone,
        email: email || req.user.email,
        website: '',
      },
      owner: req.user._id,
      status: 'active',
      settings: {
        multiLocation: {
          shareClientsAcrossBranches: shareClientsAcrossBranches,
        },
      },
    });
    await business.save();

    // Provision the tenant database + default settings (mirrors routes/admin.js).
    try {
      const businessConnection = await databaseManager.getConnection(business.code, req.mainConnection);
      const businessModels = modelFactory.getCachedBusinessModels(businessConnection);
      const defaultSettings = new businessModels.BusinessSettings({
        branchId: business._id,
        name: business.name,
        email: business.contact.email,
        phone: business.contact.phone,
        address: business.address.street,
        city: business.address.city,
        state: business.address.state,
        zipCode: business.address.zipCode,
        receiptPrefix: 'INV',
        invoicePrefix: 'INV',
        receiptNumber: 1,
        autoIncrementReceipt: true,
        currency: 'INR',
        taxRate: 18,
        enableCurrency: true,
        enableTax: true,
      });
      await defaultSettings.save();
    } catch (settingsError) {
      logger.error('add-branch: default settings creation failed:', settingsError.message);
      // Don't fail branch creation if seed settings fail.
    }

    res.status(201).json({
      success: true,
      data: {
        branch: {
          id: String(business._id),
          code: business.code,
          name: business.name,
          city: business.address.city,
          status: business.status,
        },
      },
      message: 'Branch created successfully',
    });
  } catch (error) {
    logger.error('branch-management add error:', error);
    res.status(500).json({ success: false, error: 'Failed to add branch', details: error.message });
  }
});

/* ------------------------------------------------------------------ */
/* PATCH /branches/:branchId/status                                    */
/* ------------------------------------------------------------------ */

const branchIdParamSchema = z
  .object({ branchId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid branchId') })
  .strict();

const statusBodySchema = z.object({ isActive: z.boolean() }).strict();

router.patch(
  '/branches/:branchId/status',
  guard,
  validate(branchIdParamSchema, 'params'),
  validate(statusBodySchema),
  async (req, res) => {
    try {
      const { branchId } = req.params;
      const { isActive } = req.body;
      const Business = getBusinessModel(req.mainConnection);

      const branch = await Business.findOne({ _id: branchId, owner: req.user._id });
      if (!branch) {
        return res.status(404).json({ success: false, error: 'Branch not found' });
      }

      if (branch.status === 'deleted' || branch.status === 'suspended') {
        return res.status(409).json({
          success: false,
          error: 'This branch cannot be managed here',
          message: 'Billing-suspended or deleted branches are managed by support.',
        });
      }

      // Cannot deactivate the branch the owner is currently signed into — they
      // would hide their own session. The UI prompts them to switch first.
      if (!isActive && String(branch._id) === String(req.user.branchId)) {
        return res.status(409).json({
          success: false,
          error: 'CANNOT_DEACTIVATE_ACTIVE_BRANCH',
          message: 'Switch to another branch before deactivating this one.',
        });
      }

      branch.status = isActive ? 'active' : 'inactive';
      branch.suspendedAt = null;
      branch.updatedAt = new Date();
      await branch.save();

      res.json({
        success: true,
        data: {
          branch: {
            id: String(branch._id),
            code: branch.code,
            name: branch.name,
            status: branch.status,
            isActive: branch.status === 'active',
          },
        },
        message: isActive ? 'Branch reactivated' : 'Branch deactivated',
      });
    } catch (error) {
      logger.error('branch-management status error:', error);
      res.status(500).json({ success: false, error: 'Failed to update branch status' });
    }
  }
);

/* ------------------------------------------------------------------ */
/* GET /branches/:branchId/config  (metadata + booking + hours)        */
/* ------------------------------------------------------------------ */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function normalizeHours(operatingHours) {
  const src = operatingHours || {};
  const out = {};
  for (const day of DAYS) {
    const d = src[day] || {};
    out[day] = {
      open: d.open || '09:00',
      close: d.close || '18:00',
      closed: d.closed === true,
    };
  }
  return out;
}

router.get(
  '/branches/:branchId/config',
  guard,
  validate(branchIdParamSchema, 'params'),
  async (req, res) => {
    try {
      const { branchId } = req.params;
      const Business = getBusinessModel(req.mainConnection);
      const branch = await Business.findOne({ _id: branchId, owner: req.user._id })
        .select(
          'name code address contact settings.operatingHours settings.appointmentSettings settings.revenueTarget status'
        )
        .lean();

      if (!branch) {
        return res.status(404).json({ success: false, error: 'Branch not found' });
      }

      res.json({
        success: true,
        data: {
          config: {
            id: String(branch._id),
            code: branch.code,
            name: branch.name,
            status: branch.status,
            address: {
              street: branch.address?.street || '',
              city: branch.address?.city || '',
              state: branch.address?.state || '',
              zipCode: branch.address?.zipCode || '',
            },
            phone: branch.contact?.phone || '',
            email: branch.contact?.email || '',
            allowOnlineBooking: branch.settings?.appointmentSettings?.allowOnlineBooking === true,
            allowCrossBranchBooking:
              branch.settings?.appointmentSettings?.allowCrossBranchBooking === true,
            cancellationWindowHours:
              branch.settings?.appointmentSettings?.cancellationWindowHours ?? 24,
            revenueTargetMonthly: branch.settings?.revenueTarget?.monthly || 0,
            operatingHours: normalizeHours(branch.settings?.operatingHours),
          },
        },
      });
    } catch (error) {
      logger.error('branch-management config get error:', error);
      res.status(500).json({ success: false, error: 'Failed to load branch settings' });
    }
  }
);

/* ------------------------------------------------------------------ */
/* PATCH /branches/:branchId  (edit metadata + online booking + hours) */
/* ------------------------------------------------------------------ */

const dayHoursSchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closed: z.boolean().optional(),
  })
  .strict();

const updateBranchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(4).max(20).optional(),
    email: z.string().trim().email().max(320).optional(),
    address: z
      .object({
        street: z.string().trim().min(1).max(300).optional(),
        city: z.string().trim().min(1).max(120).optional(),
        state: z.string().trim().max(120).optional(),
        zipCode: z.string().trim().max(20).optional(),
      })
      .strict()
      .optional(),
    allowOnlineBooking: z.boolean().optional(),
    allowCrossBranchBooking: z.boolean().optional(),
    cancellationWindowHours: z.number().int().min(0).optional(),
    revenueTargetMonthly: z.number().min(0).optional(),
    operatingHours: z
      .object({
        monday: dayHoursSchema,
        tuesday: dayHoursSchema,
        wednesday: dayHoursSchema,
        thursday: dayHoursSchema,
        friday: dayHoursSchema,
        saturday: dayHoursSchema,
        sunday: dayHoursSchema,
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

router.patch(
  '/branches/:branchId',
  guard,
  validate(branchIdParamSchema, 'params'),
  validate(updateBranchSchema),
  async (req, res) => {
    try {
      const { branchId } = req.params;
      const body = req.body;
      const Business = getBusinessModel(req.mainConnection);

      const branch = await Business.findOne({ _id: branchId, owner: req.user._id });
      if (!branch) {
        return res.status(404).json({ success: false, error: 'Branch not found' });
      }
      if (branch.status === 'deleted' || branch.status === 'suspended') {
        return res.status(409).json({
          success: false,
          error: 'This branch cannot be managed here',
          message: 'Billing-suspended or deleted branches are managed by support.',
        });
      }

      if (body.name != null) branch.name = body.name;
      if (body.phone != null) branch.contact.phone = body.phone;
      if (body.email != null) branch.contact.email = body.email;
      if (body.address) {
        for (const key of ['street', 'city', 'state', 'zipCode']) {
          if (body.address[key] != null) branch.address[key] = body.address[key];
        }
      }

      if (body.allowOnlineBooking != null) {
        branch.settings = branch.settings || {};
        branch.settings.appointmentSettings = branch.settings.appointmentSettings || {};
        branch.settings.appointmentSettings.allowOnlineBooking = body.allowOnlineBooking;
      }

      if (body.allowCrossBranchBooking != null) {
        branch.settings = branch.settings || {};
        branch.settings.appointmentSettings = branch.settings.appointmentSettings || {};
        branch.settings.appointmentSettings.allowCrossBranchBooking = body.allowCrossBranchBooking;
      }

      if (body.cancellationWindowHours != null) {
        branch.settings = branch.settings || {};
        branch.settings.appointmentSettings = branch.settings.appointmentSettings || {};
        branch.settings.appointmentSettings.cancellationWindowHours = body.cancellationWindowHours;
      }

      if (body.revenueTargetMonthly != null) {
        branch.settings = branch.settings || {};
        branch.settings.revenueTarget = branch.settings.revenueTarget || {};
        branch.settings.revenueTarget.monthly = body.revenueTargetMonthly;
      }

      if (body.operatingHours) {
        branch.settings = branch.settings || {};
        const current = normalizeHours(branch.settings.operatingHours);
        for (const day of DAYS) {
          if (body.operatingHours[day]) {
            current[day] = { ...current[day], ...body.operatingHours[day] };
          }
        }
        branch.settings.operatingHours = current;
      }

      branch.updatedAt = new Date();
      await branch.save();

      res.json({
        success: true,
        data: {
          config: {
            id: String(branch._id),
            code: branch.code,
            name: branch.name,
            status: branch.status,
            address: {
              street: branch.address?.street || '',
              city: branch.address?.city || '',
              state: branch.address?.state || '',
              zipCode: branch.address?.zipCode || '',
            },
            phone: branch.contact?.phone || '',
            email: branch.contact?.email || '',
            allowOnlineBooking: branch.settings?.appointmentSettings?.allowOnlineBooking === true,
            allowCrossBranchBooking:
              branch.settings?.appointmentSettings?.allowCrossBranchBooking === true,
            cancellationWindowHours:
              branch.settings?.appointmentSettings?.cancellationWindowHours ?? 24,
            revenueTargetMonthly: branch.settings?.revenueTarget?.monthly || 0,
            operatingHours: normalizeHours(branch.settings?.operatingHours),
          },
        },
        message: 'Branch settings saved',
      });
    } catch (error) {
      logger.error('branch-management config update error:', error);
      res.status(500).json({ success: false, error: 'Failed to save branch settings' });
    }
  }
);

registerPhase2Routes(router, {
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
});

module.exports = router;
