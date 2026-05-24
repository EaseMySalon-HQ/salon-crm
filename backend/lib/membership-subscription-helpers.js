'use strict';

const mongoose = require('mongoose');

/**
 * @param {Date} dayStart Start of calendar day (existing callers use setHours(0,0,0,0)).
 */
function activeMembershipMongoMatch(dayStart) {
  return {
    status: 'ACTIVE',
    $or: [{ expiryDate: null }, { expiryDate: { $gte: dayStart } }],
  };
}

function expiringMembershipMongoMatch(dayStart, dayEndInclusive) {
  return {
    status: 'ACTIVE',
    expiryDate: { $ne: null, $gte: dayStart, $lte: dayEndInclusive },
  };
}

function membershipExpiredMongoMatch(dayStart) {
  return {
    $or: [
      { status: 'EXPIRED' },
      { status: 'ACTIVE', expiryDate: { $ne: null, $lt: dayStart } },
    ],
  };
}

function subscriptionExpiryDateForPlan(plan, startDate = new Date()) {
  if (plan.unlimitedDuration) return null;
  const expiryDate = new Date(startDate);
  const days = Number(plan.durationInDays);
  if (!Number.isFinite(days) || days < 1) return expiryDate;
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
}

async function resetAppliesToAllClientsExcept(MembershipPlan, branchId, exceptPlanId) {
  const bid = branchId instanceof mongoose.Types.ObjectId ? branchId : new mongoose.Types.ObjectId(String(branchId));
  const filter = { branchId: bid };
  if (exceptPlanId) {
    filter._id = { $ne: exceptPlanId instanceof mongoose.Types.ObjectId ? exceptPlanId : new mongoose.Types.ObjectId(String(exceptPlanId)) };
  }
  await MembershipPlan.updateMany(filter, { $set: { appliesToAllClients: false } });
}

async function assignUniversalMembershipToNewClient(businessModels, branchId, clientId, clientDoc) {
  const { MembershipPlan, MembershipSubscription } = businessModels;
  if (clientDoc && clientDoc.isWalkIn === true) return { assigned: false, reason: 'walk_in' };

  const bid = branchId instanceof mongoose.Types.ObjectId ? branchId : new mongoose.Types.ObjectId(String(branchId));
  const cid = clientId instanceof mongoose.Types.ObjectId ? clientId : new mongoose.Types.ObjectId(String(clientId));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingActive = await MembershipSubscription.findOne({
    branchId: bid,
    customerId: cid,
    ...activeMembershipMongoMatch(today),
  })
    .select('_id')
    .lean();
  if (existingActive) return { assigned: false, reason: 'already_active' };

  const plan = await MembershipPlan.findOne({
    branchId: bid,
    isActive: true,
    appliesToAllClients: true,
  }).lean();

  if (!plan) return { assigned: false, reason: 'no_universal_plan' };

  const startDate = new Date();
  const expiryDate = subscriptionExpiryDateForPlan(plan, startDate);

  await MembershipSubscription.create({
    branchId: bid,
    customerId: cid,
    planId: plan._id,
    startDate,
    expiryDate,
    status: 'ACTIVE',
    saleId: null,
  });

  return { assigned: true };
}

async function ensureAllClientsSubscribedToUniversalPlan(businessModels, branchId, plan) {
  const { Client, MembershipSubscription } = businessModels;
  const bid = branchId instanceof mongoose.Types.ObjectId ? branchId : new mongoose.Types.ObjectId(String(branchId));
  /** @type {import('mongoose').Types.ObjectId} */
  const planId = plan._id;

  if (!plan.appliesToAllClients || !plan.isActive) {
    return { created: 0, skipped: true };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clients = await Client.find({
    branchId: bid,
    isWalkIn: { $ne: true },
  })
    .select('_id')
    .lean();

  let created = 0;
  const batchSize = 200;

  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    const clientIds = batch.map((c) => c._id);

    const activeRows = await MembershipSubscription.find({
      branchId: bid,
      customerId: { $in: clientIds },
      ...activeMembershipMongoMatch(today),
    })
      .select('customerId')
      .lean();

    const hasActive = new Set(activeRows.map((r) => String(r.customerId)));

    const startDate = new Date();
    const expiryDate = subscriptionExpiryDateForPlan(plan, startDate);

    const docs = [];
    for (const c of batch) {
      if (hasActive.has(String(c._id))) continue;
      docs.push({
        branchId: bid,
        customerId: c._id,
        planId,
        startDate,
        expiryDate,
        status: 'ACTIVE',
        saleId: null,
      });
    }

    if (docs.length) {
      await MembershipSubscription.insertMany(docs, { ordered: false });
      created += docs.length;
    }
  }

  return { created };
}

module.exports = {
  activeMembershipMongoMatch,
  expiringMembershipMongoMatch,
  membershipExpiredMongoMatch,
  subscriptionExpiryDateForPlan,
  resetAppliesToAllClientsExcept,
  assignUniversalMembershipToNewClient,
  ensureAllClientsSubscribedToUniversalPlan,
};
