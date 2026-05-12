const mongoose = require('mongoose');

/**
 * Lightweight in-app alerts for staff: derived from live tenant data (no separate inbox store).
 *
 * Each item includes `fingerprint` for client dismissals (low stock is per product: `stock` + `min`).
 *
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId|string} params.branchId
 * @param {object} params.businessModels – req.businessModels from setupBusinessDatabase
 * @returns {Promise<{ success: true, data: { items: object[] } }>}
 */
async function buildNotificationsFeed({ branchId, businessModels }) {
  const { Product, MembershipSubscription, ClientPackage } = businessModels;

  const bid =
    branchId instanceof mongoose.Types.ObjectId
      ? branchId
      : new mongoose.Types.ObjectId(String(branchId));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  /** Retail / mixed products where current stock is below minimum threshold (defaults to 5 in schema). */
  const lowStockMatch = {
    branchId: bid,
    isActive: true,
    productType: { $in: ['retail', 'both'] },
    $expr: {
      $lt: ['$stock', { $ifNull: ['$minimumStock', 5] }],
    },
  };

  const [lowStockDocs, membersExpiringCount, packagesExpiringCount] = await Promise.all([
    Product.find(lowStockMatch)
      .select('name stock minimumStock')
      .sort({ name: 1 })
      .limit(50) // keep feed responsive; rest still visible after restocking these
      .lean(),
    MembershipSubscription.countDocuments({
      branchId: bid,
      status: 'ACTIVE',
      expiryDate: { $gte: today, $lte: in30 },
    }),
    ClientPackage.countDocuments({
      branchId: bid,
      status: 'ACTIVE',
      expiry_date: { $ne: null, $gte: today, $lte: in7 },
    }),
  ]);

  const items = [];
  const ts = new Date().toISOString();

  for (const p of lowStockDocs) {
    const pid = String(p._id);
    const minS = typeof p.minimumStock === 'number' ? p.minimumStock : 5;
    const st = typeof p.stock === 'number' ? p.stock : 0;
    const nm = (p.name && String(p.name).trim()) || 'Product';
    items.push({
      id: `low-stock-product:${pid}`,
      type: 'low_stock',
      title: nm,
      body: `${st} in stock · minimum ${minS}`,
      fingerprint: `stock:${st}:min:${minS}`,
      href: '/settings?section=products',
      severity: 'warning',
      at: ts,
    });
  }

  if (membersExpiringCount > 0) {
    items.push({
      id: 'membership-expiring-30d',
      type: 'membership_expiry',
      title: 'Memberships expiring soon',
      body: `${membersExpiringCount} active membership${
        membersExpiringCount === 1 ? '' : 's'
      } expiring within 30 days.`,
      fingerprint: `members-exp-30d:${membersExpiringCount}`,
      href: '/membership',
      severity: 'info',
      at: ts,
    });
  }

  if (packagesExpiringCount > 0) {
    items.push({
      id: 'packages-expiring-7d',
      type: 'package_expiry',
      title: 'Client packages expiring',
      body: `${packagesExpiringCount} package${
        packagesExpiringCount === 1 ? '' : 's'
      } expiring within 7 days.`,
      fingerprint: `client-pkg-exp-7d:${packagesExpiringCount}`,
      href: '/packages/reports',
      severity: 'info',
      at: ts,
    });
  }

  return {
    success: true,
    data: { items },
  };
}

module.exports = {
  buildNotificationsFeed,
};
