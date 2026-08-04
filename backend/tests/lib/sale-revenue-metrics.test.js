'use strict';

const {
  saleGrossRevenue,
  saleNetRevenue,
  sumGrossRevenueFromSales,
  sumNetRevenueFromSales,
} = require('../../lib/sale-revenue-metrics');

describe('sale-revenue-metrics', () => {
  test('net uses grossTotal only, never Sale.netTotal (bill + tip)', () => {
    expect(saleNetRevenue({ grossTotal: 5700, netTotal: 5900, tip: 200 })).toBe(5700);
    expect(saleNetRevenue({ netTotal: 5900, tip: 200 })).toBe(0);
  });

  test('gross adds loyalty back when breakdown present', () => {
    expect(
      saleGrossRevenue({
        grossTotal: 5500,
        netTotal: 5700,
        tip: 200,
        receiptTotalsBreakdown: {
          loyaltyDiscountAmount: 200,
          lineDiscountAmount: 0,
          cartDiscountAmount: 0,
          membershipDiscountAmount: 0,
        },
      })
    ).toBe(5700);
  });

  test('gross equals net when no discounts', () => {
    const sale = { grossTotal: 5700, tip: 100 };
    expect(saleGrossRevenue(sale)).toBe(5700);
    expect(saleNetRevenue(sale)).toBe(5700);
  });

  test('gross uses totalInclTaxBeforeLoyalty when higher than net', () => {
    expect(
      saleGrossRevenue({
        grossTotal: 5400,
        receiptTotalsBreakdown: { totalInclTaxBeforeLoyalty: 5600 },
      })
    ).toBe(5600);
  });

  test('breakdown grandTotal with tip does not inflate gross', () => {
    expect(
      saleGrossRevenue({
        grossTotal: 1000,
        tip: 500,
        receiptTotalsBreakdown: {
          totalInclTax: 1000,
          grandTotal: 1500,
          tip: 500,
        },
      })
    ).toBe(1000);
  });

  test('sum helpers exclude tips from totals', () => {
    const sales = [
      { grossTotal: 100, tip: 10, netTotal: 110 },
      { grossTotal: 200, tip: 20, netTotal: 220 },
    ];
    expect(sumNetRevenueFromSales(sales)).toBe(300);
    expect(sumGrossRevenueFromSales(sales)).toBe(300);
  });
});
