/**
 * Mirrors lib/commission-profile-calculator.ts for server-side jobs (monthly incentive email).
 */

const {
  getAttributedRevenueForStaff,
  staffIsAttributedToLineItem,
} = require('./staff-line-revenue');

function normalizeSaleLineServiceId(item) {
  if (String(item?.type || '').toLowerCase() !== 'service' || item?.serviceId == null || item.serviceId === '') {
    return null;
  }
  const raw = item.serviceId;
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    return String(raw._id);
  }
  return String(raw);
}

function normalizeSaleLineProductId(item) {
  if (String(item?.type || '').toLowerCase() !== 'product' || item?.productId == null || item.productId === '') {
    return null;
  }
  const raw = item.productId;
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    return String(raw._id);
  }
  return String(raw);
}

function normalizeCatalogId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    const id = raw._id;
    if (id == null || id === '') return null;
    return String(id);
  }
  return String(raw);
}

function enrichSalesWithServiceIdsFromCatalog(sales, services) {
  const byName = new Map();
  for (const s of services || []) {
    const id = String(s._id ?? s.id ?? '');
    const nm = String(s.name ?? '').trim().toLowerCase();
    if (!id || !nm) continue;
    if (!byName.has(nm)) byName.set(nm, id);
  }
  for (const sale of sales || []) {
    const items = sale.items;
    if (!items || !Array.isArray(items)) continue;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (String(item.type || '').toLowerCase() !== 'service' || normalizeSaleLineServiceId(item)) continue;
      const sid = byName.get(String(item.name ?? '').trim().toLowerCase());
      if (sid) items[i] = { ...item, serviceId: sid };
    }
  }
}

function enrichSalesWithProductIdsFromCatalog(sales, products) {
  const byName = new Map();
  for (const p of products || []) {
    const id = String(p._id ?? p.id ?? '');
    const nm = String(p.name ?? '').trim().toLowerCase();
    if (!id || !nm) continue;
    if (!byName.has(nm)) byName.set(nm, id);
  }
  for (const sale of sales || []) {
    const items = sale.items;
    if (!items || !Array.isArray(items)) continue;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (String(item.type || '').toLowerCase() !== 'product' || normalizeSaleLineProductId(item)) continue;
      const pid = byName.get(String(item.name ?? '').trim().toLowerCase());
      if (pid) items[i] = { ...item, productId: pid };
    }
  }
}

function calculateTargetBasedCommission(revenue, targetTiers, cascadingCommission = false) {
  let totalCommission = 0;
  if (cascadingCommission) {
    for (const tier of targetTiers || []) {
      if (revenue >= tier.from) {
        const tierRevenue = Math.min(revenue - tier.from, tier.to - tier.from);
        if (tierRevenue > 0) {
          if (tier.calculateBy === 'percent') {
            totalCommission += (tierRevenue * tier.value) / 100;
          } else {
            totalCommission += tier.value;
          }
        }
      }
    }
  } else {
    const applicableTier = (targetTiers || [])
      .filter((tier) => revenue >= tier.from && revenue <= tier.to)
      .sort((a, b) => b.from - a.from)[0];
    if (applicableTier) {
      if (applicableTier.calculateBy === 'percent') {
        totalCommission = (revenue * applicableTier.value) / 100;
      } else {
        totalCommission = applicableTier.value;
      }
    }
  }
  return totalCommission;
}

function calculateLegacyItemRatesCommission(revenue, itemRates, qualifyingItems) {
  let totalCommission = 0;
  for (const itemRate of itemRates || []) {
    if ((qualifyingItems || []).includes(itemRate.itemType)) {
      if (itemRate.calculateBy === 'percent') {
        totalCommission += (revenue * itemRate.rate) / 100;
      } else {
        totalCommission += itemRate.rate;
      }
    }
  }
  return totalCommission;
}

function calculateProductBasedCommission(productStaffItems, productRules) {
  const ruleMap = new Map();
  for (const rule of productRules || []) {
    const key = normalizeCatalogId(rule?.productId);
    if (key) {
      ruleMap.set(key, {
        calculateBy: rule.calculateBy === 'fixed' ? 'fixed' : 'percent',
        value: Number(rule.value) || 0,
      });
    }
  }

  let commission = 0;
  let revenue = 0;
  let itemCount = 0;

  for (const item of productStaffItems || []) {
    const pid = normalizeSaleLineProductId(item);
    if (!pid) continue;
    const rule = ruleMap.get(pid);
    if (!rule || rule.value <= 0) continue;
    const attributed = Math.max(0, Number(item.total) || 0);
    if (attributed <= 0) continue;
    let lineCommission = 0;
    if (rule.calculateBy === 'percent') {
      lineCommission = (attributed * rule.value) / 100;
    } else {
      lineCommission = rule.value;
    }
    commission += lineCommission;
    revenue += attributed;
    itemCount += 1;
  }

  return { commission, revenue, itemCount };
}

function calculateServiceBasedCommission(serviceStaffItems, serviceRules) {
  const ruleMap = new Map();
  for (const rule of serviceRules || []) {
    if (rule?.serviceId) {
      ruleMap.set(String(rule.serviceId), {
        calculateBy: rule.calculateBy === 'fixed' ? 'fixed' : 'percent',
        value: Number(rule.value) || 0,
      });
    }
  }

  let commission = 0;
  let revenue = 0;
  let itemCount = 0;

  for (const item of serviceStaffItems || []) {
    const sid = normalizeSaleLineServiceId(item);
    if (!sid) continue;
    const rule = ruleMap.get(sid);
    if (!rule || rule.value <= 0) continue;
    const attributed = Math.max(0, Number(item.total) || 0);
    if (attributed <= 0) continue;
    let lineCommission = 0;
    if (rule.calculateBy === 'percent') {
      lineCommission = (attributed * rule.value) / 100;
    } else {
      lineCommission = rule.value;
    }
    commission += lineCommission;
    revenue += attributed;
    itemCount += 1;
  }

  return { commission, revenue, itemCount };
}

function calculateSaleCommission(sale, staffCommissionProfiles, staffId, staffName) {
  const saleFallback = { staffId: sale.staffId, staffName: sale.staffName };
  const staffItems = (sale.items || [])
    .filter((item) => staffIsAttributedToLineItem(item, staffId, staffName, saleFallback))
    .map((item) => ({
      ...item,
      total: getAttributedRevenueForStaff(item, staffId, staffName, saleFallback),
    }));

  if (staffItems.length === 0) return null;

  const serviceItems = staffItems.filter((item) => String(item.type).toLowerCase() === 'service');
  const productItems = staffItems.filter((item) => item.type === 'product');
  const packageItems = staffItems.filter((item) => item.type === 'package');
  const membershipItems = staffItems.filter((item) => item.type === 'membership');
  const prepaidItems = staffItems.filter((item) => item.type === 'prepaid' || item.type === 'prepaid_wallet');

  const serviceRevenue = serviceItems.reduce((sum, item) => sum + item.total, 0);
  const productRevenue = productItems.reduce((sum, item) => sum + item.total, 0);
  const packageRevenue = packageItems.reduce((sum, item) => sum + item.total, 0);
  const membershipRevenue = membershipItems.reduce((sum, item) => sum + item.total, 0);
  const prepaidRevenue = prepaidItems.reduce((sum, item) => sum + item.total, 0);
  const totalRevenue = serviceRevenue + productRevenue + packageRevenue + membershipRevenue + prepaidRevenue;

  let totalCommission = 0;
  const profileBreakdown = [];

  for (const profile of staffCommissionProfiles || []) {
    if (!profile.isActive) continue;
    const profileId = String(profile.id ?? profile._id ?? '');

    if (profile.type === 'service_based') {
      if (!profile.serviceRules?.length) continue;
      const { commission: profileCommission, revenue: profileRevenue, itemCount: profileItemCount } =
        calculateServiceBasedCommission(serviceItems, profile.serviceRules);
      if (profileCommission === 0 && profileRevenue === 0) continue;
      totalCommission += profileCommission;
      profileBreakdown.push({
        profileId,
        profileName: profile.name,
        profileType: 'service_based',
        commission: profileCommission,
        revenue: profileRevenue,
        itemCount: profileItemCount,
      });
      continue;
    }

    if (profile.type === 'item_based' && profile.productRules?.length) {
      const { commission: profileCommission, revenue: profileRevenue, itemCount: profileItemCount } =
        calculateProductBasedCommission(productItems, profile.productRules);
      if (profileCommission === 0 && profileRevenue === 0) continue;
      totalCommission += profileCommission;
      profileBreakdown.push({
        profileId,
        profileName: profile.name,
        profileType: 'item_based',
        commission: profileCommission,
        revenue: profileRevenue,
        itemCount: profileItemCount,
      });
      continue;
    }

    const qualifying = profile.qualifyingItems ?? [];
    let profileRevenue = 0;
    let profileItemCount = 0;
    if (qualifying.includes('Service')) {
      profileRevenue += serviceRevenue;
      profileItemCount += serviceItems.length;
    }
    if (qualifying.includes('Product')) {
      profileRevenue += productRevenue;
      profileItemCount += productItems.length;
    }
    if (qualifying.includes('Package')) {
      profileRevenue += packageRevenue;
      profileItemCount += packageItems.length;
    }
    if (qualifying.includes('Membership')) {
      profileRevenue += membershipRevenue;
      profileItemCount += membershipItems.length;
    }
    if (qualifying.includes('Prepaid')) {
      profileRevenue += prepaidRevenue;
      profileItemCount += prepaidItems.length;
    }
    if (profileRevenue === 0) continue;

    let profileCommission = 0;
    if (profile.type === 'target_based' && profile.targetTiers) {
      profileCommission = calculateTargetBasedCommission(
        profileRevenue,
        profile.targetTiers,
        profile.cascadingCommission
      );
    } else if (profile.type === 'item_based' && profile.itemRates?.length) {
      profileCommission = calculateLegacyItemRatesCommission(
        profileRevenue,
        profile.itemRates,
        qualifying
      );
    }

    totalCommission += profileCommission;
    profileBreakdown.push({
      profileId,
      profileName: profile.name,
      profileType: profile.type,
      commission: profileCommission,
      revenue: profileRevenue,
      itemCount: profileItemCount,
    });
  }

  const effectiveCommissionRate = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0;
  const staffDisplayName =
    staffName ||
    staffItems[0]?.staffName ||
    sale.staffName ||
    String(staffId);

  return {
    staffId: String(staffId),
    staffName: staffDisplayName,
    totalCommission,
    totalRevenue,
    serviceCommission: profileBreakdown
      .filter(
        (p) =>
          p.profileType === 'service_based' ||
          (p.profileType === 'target_based' && String(p.profileName).toLowerCase().includes('service'))
      )
      .reduce((sum, p) => sum + p.commission, 0),
    productCommission: profileBreakdown
      .filter(
        (p) =>
          p.profileType === 'item_based' ||
          (p.profileType === 'target_based' && String(p.profileName).toLowerCase().includes('product'))
      )
      .reduce((sum, p) => sum + p.commission, 0),
    serviceRevenue,
    productRevenue,
    serviceCount: serviceItems.length,
    productCount: productItems.length,
    totalTransactions: 1,
    averageCommissionPerTransaction: totalCommission,
    effectiveCommissionRate,
    profileBreakdown,
  };
}

function calculateMultipleSalesCommission(sales, staffCommissionProfiles, staffId, staffName) {
  const results = (sales || [])
    .map((sale) => calculateSaleCommission(sale, staffCommissionProfiles, staffId, staffName))
    .filter(Boolean);

  if (results.length === 0) return null;

  const totalCommission = results.reduce((sum, r) => sum + r.totalCommission, 0);
  const totalRevenue = results.reduce((sum, r) => sum + r.totalRevenue, 0);
  const serviceCommission = results.reduce((sum, r) => sum + r.serviceCommission, 0);
  const productCommission = results.reduce((sum, r) => sum + r.productCommission, 0);
  const serviceRevenue = results.reduce((sum, r) => sum + r.serviceRevenue, 0);
  const productRevenue = results.reduce((sum, r) => sum + r.productRevenue, 0);
  const serviceCount = results.reduce((sum, r) => sum + r.serviceCount, 0);
  const productCount = results.reduce((sum, r) => sum + r.productCount, 0);
  const totalTransactions = results.length;

  const profileBreakdownMap = new Map();
  for (const result of results) {
    for (const breakdown of result.profileBreakdown) {
      const existing = profileBreakdownMap.get(breakdown.profileId);
      if (existing) {
        existing.commission += breakdown.commission;
        existing.revenue += breakdown.revenue;
        existing.itemCount += breakdown.itemCount;
      } else {
        profileBreakdownMap.set(breakdown.profileId, { ...breakdown });
      }
    }
  }

  return {
    staffId: String(staffId),
    staffName: results[0].staffName,
    totalCommission,
    totalRevenue,
    serviceCommission,
    productCommission,
    serviceRevenue,
    productRevenue,
    serviceCount,
    productCount,
    totalTransactions,
    averageCommissionPerTransaction: totalTransactions > 0 ? totalCommission / totalTransactions : 0,
    effectiveCommissionRate: totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0,
    profileBreakdown: Array.from(profileBreakdownMap.values()),
  };
}

function calculateAllStaffCommission(sales, staffMembers, commissionProfiles) {
  const results = [];
  for (const staff of staffMembers || []) {
    const staffId = String(staff._id ?? staff.id ?? '');
    if (!staffId) continue;
    const profileIds = (staff.commissionProfileIds || []).map(String);
    if (profileIds.length === 0) continue;
    const staffProfiles = (commissionProfiles || []).filter((profile) => {
      const pid = String(profile.id ?? profile._id ?? '');
      return profileIds.includes(pid);
    });
    if (staffProfiles.length === 0) continue;
    const staffName = staff.name || `${staff.firstName || ''} ${staff.lastName || ''}`.trim();
    const result = calculateMultipleSalesCommission(sales, staffProfiles, staffId, staffName);
    if (result) results.push(result);
  }
  return results.sort((a, b) => b.totalCommission - a.totalCommission);
}

module.exports = {
  enrichSalesWithServiceIdsFromCatalog,
  enrichSalesWithProductIdsFromCatalog,
  calculateSaleCommission,
  calculateMultipleSalesCommission,
  calculateAllStaffCommission,
};
