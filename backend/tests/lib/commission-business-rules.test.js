const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateMultipleSalesCommission,
} = require('../../lib/commission-profile-calculator');

const STAFF_ID = 'staff-1';
const STAFF_NAME = 'Asha';

// One flat percentage profile that pays 10% on all qualifying line types.
const profile = {
  id: 'p1',
  name: 'Flat 10%',
  isActive: true,
  type: 'target_based',
  qualifyingItems: ['Service', 'Product', 'Membership', 'Package'],
  targetTiers: [{ from: 0, to: 1000000, calculateBy: 'percent', value: 10 }],
};

function sale(overrides = {}) {
  return {
    billNo: 'B1',
    staffId: STAFF_ID,
    staffName: STAFF_NAME,
    status: 'completed',
    paymentStatus: { totalAmount: 1000, paidAmount: 1000, remainingAmount: 0 },
    items: [
      { type: 'service', name: 'Haircut', quantity: 1, price: 600, total: 600, staffId: STAFF_ID, staffName: STAFF_NAME },
      { type: 'product', name: 'Shampoo', quantity: 1, price: 400, total: 400, staffId: STAFF_ID, staffName: STAFF_NAME },
    ],
    ...overrides,
  };
}

test('no settings: commission on all line types (baseline)', () => {
  const res = calculateMultipleSalesCommission([sale()], [profile], STAFF_ID, STAFF_NAME);
  // 10% of (600 + 400) = 100
  assert.equal(Math.round(res.totalCommission), 100);
});

test('sale-type gating: product sales disabled', () => {
  const settings = { onServiceSales: true, onProductSales: false, onMembershipSales: false, onPackageSales: false, calculateOn: 'after_discount', payableWhen: 'on_sale' };
  const res = calculateMultipleSalesCommission([sale()], [profile], STAFF_ID, STAFF_NAME, settings);
  // Only service 600 counts → 60
  assert.equal(Math.round(res.totalCommission), 60);
});

test('calculateOn before_discount uses gross revenue', () => {
  const discounted = sale({
    items: [
      { type: 'service', name: 'Haircut', quantity: 1, price: 1000, total: 800, discount: 20, staffId: STAFF_ID, staffName: STAFF_NAME },
    ],
  });
  const after = calculateMultipleSalesCommission([discounted], [profile], STAFF_ID, STAFF_NAME, {
    onServiceSales: true, onProductSales: true, onMembershipSales: true, onPackageSales: true, calculateOn: 'after_discount', payableWhen: 'on_sale',
  });
  const before = calculateMultipleSalesCommission([discounted], [profile], STAFF_ID, STAFF_NAME, {
    onServiceSales: true, onProductSales: true, onMembershipSales: true, onPackageSales: true, calculateOn: 'before_discount', payableWhen: 'on_sale',
  });
  // after: 10% of 800 = 80; before: 10% of gross 1000 = 100
  assert.equal(Math.round(after.totalCommission), 80);
  assert.equal(Math.round(before.totalCommission), 100);
});

test('payableWhen on_payment excludes unpaid sales', () => {
  const unpaid = sale({ status: 'unpaid', paymentStatus: { totalAmount: 1000, paidAmount: 0, remainingAmount: 1000 } });
  const settings = { onServiceSales: true, onProductSales: true, onMembershipSales: true, onPackageSales: true, calculateOn: 'after_discount', payableWhen: 'on_payment' };
  const res = calculateMultipleSalesCommission([unpaid], [profile], STAFF_ID, STAFF_NAME, settings);
  assert.equal(res, null); // no payable sales → no result
});

test('payableWhen on_payment includes fully paid sales', () => {
  const settings = { onServiceSales: true, onProductSales: true, onMembershipSales: true, onPackageSales: true, calculateOn: 'after_discount', payableWhen: 'on_payment' };
  const res = calculateMultipleSalesCommission([sale()], [profile], STAFF_ID, STAFF_NAME, settings);
  assert.equal(Math.round(res.totalCommission), 100);
});

test('payableWhen on_payment excludes completed but unpaid sales', () => {
  const due = sale({
    status: 'completed',
    paymentStatus: { totalAmount: 1000, paidAmount: 0, remainingAmount: 1000 },
  });
  const settings = {
    onServiceSales: true,
    onProductSales: true,
    onMembershipSales: true,
    onPackageSales: true,
    calculateOn: 'after_discount',
    payableWhen: 'on_payment',
  };
  const res = calculateMultipleSalesCommission([due], [profile], STAFF_ID, STAFF_NAME, settings);
  assert.equal(res, null);
});

test('payableWhen on_payment excludes zero-paid with zero remaining (stale)', () => {
  const stale = sale({
    status: 'unpaid',
    paymentStatus: { totalAmount: 1000, paidAmount: 0, remainingAmount: 0 },
  });
  const settings = {
    onServiceSales: true,
    onProductSales: true,
    onMembershipSales: true,
    onPackageSales: true,
    calculateOn: 'after_discount',
    payableWhen: 'on_payment',
  };
  const res = calculateMultipleSalesCommission([stale], [profile], STAFF_ID, STAFF_NAME, settings);
  assert.equal(res, null);
});

const itemBasedProfile = {
  id: 'p-item',
  name: 'Product by item',
  isActive: true,
  type: 'item_based',
  productRules: [{ productId: 'prod-1', calculateBy: 'fixed', value: 50 }],
};

test('item_based fixed commission applies per product unit (single line qty 10)', () => {
  const bulk = sale({
    items: [
      {
        type: 'product',
        name: 'Serum',
        productId: 'prod-1',
        quantity: 10,
        price: 100,
        total: 1000,
        staffId: STAFF_ID,
        staffName: STAFF_NAME,
      },
    ],
  });
  const res = calculateMultipleSalesCommission([bulk], [itemBasedProfile], STAFF_ID, STAFF_NAME);
  assert.equal(res.totalCommission, 500);
  assert.equal(res.profileBreakdown[0].itemCount, 10);
});

test('item_based fixed commission applies per product across multiple lines', () => {
  const multi = sale({
    items: Array.from({ length: 10 }, () => ({
      type: 'product',
      name: 'Serum',
      productId: 'prod-1',
      quantity: 1,
      price: 100,
      total: 100,
      staffId: STAFF_ID,
      staffName: STAFF_NAME,
    })),
  });
  const res = calculateMultipleSalesCommission([multi], [itemBasedProfile], STAFF_ID, STAFF_NAME);
  assert.equal(res.totalCommission, 500);
  assert.equal(res.profileBreakdown[0].itemCount, 10);
});

test('target_based service commission follows qualifying items, not profile name', () => {
  const targetProfile = {
    id: 'p-target',
    name: 'Commission by Target',
    isActive: true,
    type: 'target_based',
    qualifyingItems: ['Service'],
    targetTiers: [{ from: 0, to: 1000000, calculateBy: 'percent', value: 5 }],
  };
  const serviceSale = sale({
    items: [
      {
        type: 'service',
        name: 'Haircut',
        quantity: 1,
        price: 65000,
        total: 65000,
        staffId: STAFF_ID,
        staffName: STAFF_NAME,
      },
    ],
  });
  const res = calculateMultipleSalesCommission([serviceSale], [targetProfile], STAFF_ID, STAFF_NAME);
  assert.equal(res.totalCommission, 3250);
  assert.equal(res.serviceCommission, 3250);
  assert.equal(res.productCommission, 0);
});
