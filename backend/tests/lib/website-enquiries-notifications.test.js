/**
 * Coverage for website enquiry notification list helpers.
 */

const mongoose = require('mongoose');
const {
  listNewWebsiteEnquiriesForNotifications,
  serializeWebsiteEnquiryNotification,
} = require('../../lib/website-enquiries-notifications');

function mockEnquiryFind(rows) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => rows),
  };
  return jest.fn(() => chain);
}

describe('website-enquiries-notifications', () => {
  const branchId = new mongoose.Types.ObjectId();

  it('returns empty list when WebsiteEnquiry model is missing', async () => {
    const items = await listNewWebsiteEnquiriesForNotifications({
      branchId,
      businessModels: {},
    });
    expect(items).toEqual([]);
  });

  it('serializes product requests with requested products summary', async () => {
    const id = new mongoose.Types.ObjectId();
    const rows = [
      {
        _id: id,
        type: 'product_request',
        name: 'Jane Doe',
        phone: '9876543210',
        message: '',
        requestedProducts: [{ productName: 'Shampoo', quantity: 2 }],
        createdAt: new Date('2026-07-22T10:00:00.000Z'),
      },
    ];
    const items = await listNewWebsiteEnquiriesForNotifications({
      branchId,
      businessModels: { WebsiteEnquiry: { find: mockEnquiryFind(rows) } },
    });
    expect(items).toHaveLength(1);
    expect(items[0].typeLabel).toBe('Product request');
    expect(items[0].summary).toBe('Shampoo × 2');
    expect(items[0].href).toBe('/settings?section=website&tab=enquiries');
  });

  it('serializeWebsiteEnquiryNotification falls back to message', () => {
    const row = serializeWebsiteEnquiryNotification({
      _id: new mongoose.Types.ObjectId(),
      type: 'general',
      name: 'Alex',
      phone: '9000000000',
      message: 'Need bridal package info',
    });
    expect(row.typeLabel).toBe('General');
    expect(row.summary).toBe('Need bridal package info');
  });
});
