const WALK_IN_PHONE = '__EMS_WALK_IN__';

/**
 * Ensures each business DB has exactly one system Walk-in customer (no real contact details required).
 * Idempotent; safe to call on every request (middleware caches the promise per connection).
 *
 * @param {object} businessModels - req.businessModels
 * @param {import('mongoose').Types.ObjectId|string} branchId
 */
async function ensureWalkInClient(businessModels, branchId) {
  const { Client } = businessModels;
  if (!Client || !branchId) return;

  let doc = await Client.findOne({
    $or: [{ isWalkIn: true }, { phone: WALK_IN_PHONE }],
  }).lean();

  if (doc) {
    await Client.updateOne(
      { _id: doc._id },
      {
        $set: {
          isWalkIn: true,
          phone: WALK_IN_PHONE,
          name: doc.name && String(doc.name).trim() ? doc.name : 'Walk-in',
          branchId,
          status: 'active',
        },
      },
    );
    return;
  }

  await Client.create({
    name: 'Walk-in',
    phone: WALK_IN_PHONE,
    branchId,
    status: 'active',
    isWalkIn: true,
    totalVisits: 0,
    totalSpent: 0,
  });
}

module.exports = {
  ensureWalkInClient,
  WALK_IN_PHONE,
};
