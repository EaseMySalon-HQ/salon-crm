/**
 * Cross-branch client history (bills + appointments) when shareClientsAcrossBranches is on.
 */

const { fanOut } = require('./branch-fanout');
const { getAllActiveBranchesForOwner } = require('./get-all-branches');
const { normalizePhone } = require('./branch-management-helpers');
const { findClientByPhone, resolveOwnerShareClientsContext } = require('./share-clients-across-branches');

function phoneMatchFilter(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const last10 = normalizePhone(raw);
  const or = [{ customerPhone: raw }];
  if (last10 && last10 !== raw) {
    or.push({ customerPhone: { $regex: new RegExp(`${last10}$`) } });
  }
  return { $or: or };
}

async function salesForBranchByPhone(ctx, phone, limit, currentBranchId) {
  const { Sale } = ctx.models;
  const filter = phoneMatchFilter(phone);
  if (!filter) return [];

  const sales = await Sale.find(filter).sort({ date: -1 }).limit(limit).lean();
  return sales.map((s) => ({
    ...s,
    branchId: ctx.branch.id,
    branchName: ctx.branch.name,
    isCurrentBranch: String(ctx.branch.id) === String(currentBranchId),
  }));
}

async function appointmentsForBranchByPhone(ctx, phone, limit, currentBranchId) {
  const { Client, Appointment } = ctx.models;
  const client = await findClientByPhone(Client, phone);
  if (!client) return [];

  const branchOid = client.branchId || ctx.branch.id;
  const apts = await Appointment.find({
    clientId: client._id,
    branchId: branchOid,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return apts.map((a) => ({
    ...a,
    branchId: ctx.branch.id,
    branchName: ctx.branch.name,
    isCurrentBranch: String(ctx.branch.id) === String(currentBranchId),
  }));
}

async function branchSummariesForPhone(ctx, phone) {
  const { Client } = ctx.models;
  const client = await findClientByPhone(Client, phone);
  if (!client) {
    return {
      branchId: ctx.branch.id,
      branchName: ctx.branch.name,
      clientId: null,
      totalVisits: 0,
      totalSpent: 0,
      lastVisit: null,
    };
  }
  return {
    branchId: ctx.branch.id,
    branchName: ctx.branch.name,
    clientId: String(client._id),
    totalVisits: client.totalVisits || 0,
    totalSpent: client.totalSpent || 0,
    lastVisit: client.lastVisit || null,
  };
}

async function fetchSharedSalesByPhone({
  mainConnection,
  ownerId,
  currentBranchId,
  phone,
  limit = 50,
}) {
  const branches = await getAllActiveBranchesForOwner(mainConnection, ownerId);
  if (branches.length === 0) return [];

  const perBranch = Math.min(limit, Math.ceil(limit / branches.length) + 15);
  const results = await fanOut(mainConnection, branches, (ctx) =>
    salesForBranchByPhone(ctx, phone, perBranch, currentBranchId)
  );

  const merged = results.flatMap((r) => r.data || []);
  merged.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return merged.slice(0, limit);
}

async function fetchSharedAppointmentsByPhone({
  mainConnection,
  ownerId,
  currentBranchId,
  phone,
  limit = 200,
}) {
  const branches = await getAllActiveBranchesForOwner(mainConnection, ownerId);
  if (branches.length === 0) return [];

  const perBranch = Math.min(limit, Math.ceil(limit / branches.length) + 25);
  const results = await fanOut(mainConnection, branches, (ctx) =>
    appointmentsForBranchByPhone(ctx, phone, perBranch, currentBranchId)
  );

  const merged = results.flatMap((r) => r.data || []);
  merged.sort(
    (a, b) =>
      new Date(b.createdAt || b.date || 0).getTime() -
      new Date(a.createdAt || a.date || 0).getTime()
  );
  return merged.slice(0, limit);
}

async function fetchSharedClientHistory({
  mainConnection,
  currentBranchId,
  phone,
  salesLimit = 50,
  appointmentsLimit = 200,
}) {
  const shareCtx = await resolveOwnerShareClientsContext(mainConnection, currentBranchId);
  if (!shareCtx?.shareClientsAcrossBranches) {
    return { shared: false, branches: [], sales: [], appointments: [] };
  }

  const branches = await getAllActiveBranchesForOwner(mainConnection, shareCtx.ownerId);
  const summaryResults = await fanOut(mainConnection, branches, (ctx) =>
    branchSummariesForPhone(ctx, phone)
  );

  const [sales, appointments] = await Promise.all([
    fetchSharedSalesByPhone({
      mainConnection,
      ownerId: shareCtx.ownerId,
      currentBranchId,
      phone,
      limit: salesLimit,
    }),
    fetchSharedAppointmentsByPhone({
      mainConnection,
      ownerId: shareCtx.ownerId,
      currentBranchId,
      phone,
      limit: appointmentsLimit,
    }),
  ]);

  return {
    shared: true,
    branches: summaryResults.map((r) => r.data).filter(Boolean),
    sales,
    appointments,
  };
}

module.exports = {
  phoneMatchFilter,
  fetchSharedSalesByPhone,
  fetchSharedAppointmentsByPhone,
  fetchSharedClientHistory,
  salesForBranchByPhone,
  appointmentsForBranchByPhone,
};
