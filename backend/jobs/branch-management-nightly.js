/**
 * Nightly jobs for branch-management Phase 2: home-branch index + daily metrics cache.
 */

const cron = require('node-cron');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { fanOut } = require('../lib/branch-fanout');
const { getAllBranchesForOwner, getBusinessModel } = require('../lib/get-all-branches');
const { getOwnerClientIndexModel } = require('../lib/branch-management-phase2-routes');
const { normalizePhone, ymd } = require('../lib/branch-management-helpers');
const {
  dailyMetricForBranch,
  upsertDailyMetrics,
} = require('../lib/daily-metrics-cache');

async function clientsForHomeBranchIndex({ models, branch }) {
  const { Client } = models;
  const clients = await Client.find({})
    .select('phone totalVisits totalSpent lastVisit')
    .lean();
  return clients.map((c) => ({
    branchId: branch.id,
    phone: c.phone,
    totalVisits: c.totalVisits || 0,
    totalSpent: c.totalSpent || 0,
    lastVisit: c.lastVisit || null,
  }));
}

async function runHomeBranchIndexJob() {
  logger.info('branch-management: starting home-branch index job');
  const mainConnection = await databaseManager.getMainConnection();
  const Business = getBusinessModel(mainConnection);
  const OwnerClientIndex = getOwnerClientIndexModel(mainConnection);

  const owners = await Business.distinct('owner', { status: 'active' });
  for (const ownerId of owners) {
    try {
      const branchList = await getAllBranchesForOwner(mainConnection, ownerId);
      const active = branchList.filter((b) => b.status === 'active');
      if (active.length < 2) continue;

      const results = await fanOut(mainConnection, active, clientsForHomeBranchIndex);
      const byPhone = new Map();

      for (const r of results) {
        if (!r.data) continue;
        for (const c of r.data) {
          const phone = normalizePhone(c.phone);
          if (!phone) continue;
          const existing = byPhone.get(phone) || {
            phone: c.phone,
            branchVisits: {},
            totalVisits: 0,
            totalSpent: 0,
            lastVisit: null,
            homeBranchId: null,
          };
          existing.branchVisits[c.branchId] = c.totalVisits;
          existing.totalVisits += c.totalVisits;
          existing.totalSpent += c.totalSpent;
          if (
            c.lastVisit &&
            (!existing.lastVisit || new Date(c.lastVisit) > new Date(existing.lastVisit))
          ) {
            existing.lastVisit = c.lastVisit;
          }
          byPhone.set(phone, existing);
        }
      }

      for (const [phone, row] of byPhone) {
        let homeBranchId = null;
        let best = { visits: -1, spent: -1 };
        for (const r of results) {
          if (!r.data) continue;
          const match = r.data.find((c) => normalizePhone(c.phone) === phone);
          if (!match) continue;
          if (
            match.totalVisits > best.visits ||
            (match.totalVisits === best.visits && match.totalSpent > best.spent)
          ) {
            best = { visits: match.totalVisits, spent: match.totalSpent };
            homeBranchId = r.branchId;
          }
        }

        await OwnerClientIndex.updateOne(
          { ownerId, phone: row.phone },
          {
            $set: {
              homeBranchId,
              branchVisits: row.branchVisits,
              totalVisits: row.totalVisits,
              totalSpent: row.totalSpent,
              lastVisit: row.lastVisit,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error(`home-branch index failed for owner ${ownerId}:`, err.message);
    }
  }
  logger.info('branch-management: home-branch index job complete');
}

async function cacheDailyMetricsForDate(mainConnection, dateStr) {
  const Business = getBusinessModel(mainConnection);
  const businesses = await Business.find({ status: 'active' }).select('owner _id code name').lean();
  const byOwner = new Map();
  for (const b of businesses) {
    const key = String(b.owner);
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push(b);
  }

  for (const [ownerId, branches] of byOwner) {
    if (branches.length < 2) continue;
    try {
      const branchList = branches.map((b) => ({
        id: String(b._id),
        code: b.code,
        name: b.name || '',
        status: 'active',
      }));
      const results = await fanOut(mainConnection, branchList, (ctx) =>
        dailyMetricForBranch(ctx, dateStr)
      );
      const rows = results.filter((r) => r.data).map((r) => r.data);
      await upsertDailyMetrics(mainConnection, rows);
    } catch (err) {
      logger.error(`daily metrics cache failed for owner ${ownerId} (${dateStr}):`, err.message);
    }
  }
}

async function runDailyMetricsCacheJob() {
  logger.info('branch-management: starting daily metrics cache job');
  const mainConnection = await databaseManager.getMainConnection();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await cacheDailyMetricsForDate(mainConnection, ymd(yesterday));
  logger.info('branch-management: daily metrics cache job complete');
}

async function runTodayMetricsCacheJob() {
  logger.info('branch-management: refreshing today daily metrics cache');
  const mainConnection = await databaseManager.getMainConnection();
  await cacheDailyMetricsForDate(mainConnection, ymd(new Date()));
  logger.info('branch-management: today daily metrics cache refresh complete');
}

function setupBranchManagementJobs() {
  // 2:30 AM IST — home branch index
  cron.schedule('30 2 * * *', () => {
    runHomeBranchIndexJob().catch((e) => logger.error('home-branch job error:', e));
  });

  // 3:00 AM IST — yesterday's daily metrics
  cron.schedule('0 3 * * *', () => {
    runDailyMetricsCacheJob().catch((e) => logger.error('daily metrics job error:', e));
  });

  // Top of every hour — refresh today's metrics (keeps dashboards current)
  cron.schedule('0 * * * *', () => {
    runTodayMetricsCacheJob().catch((e) => logger.error('today metrics job error:', e));
  });

  logger.info('Branch management nightly + hourly jobs scheduled');
}

module.exports = {
  setupBranchManagementJobs,
  runHomeBranchIndexJob,
  runDailyMetricsCacheJob,
  runTodayMetricsCacheJob,
};
