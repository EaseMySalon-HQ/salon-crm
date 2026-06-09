const {
  buildFeedbackPublicUrl,
  buildReceiptPublicUrl,
  buildSaleNotificationLinks,
  canUseReceiptFeedbackLink,
  resolveReceiptFeedbackLinkForSend,
} = require('../../lib/feedback-link-helpers');

describe('feedback-link-helpers', () => {
  it('builds public feedback and receipt URLs', () => {
    const branchId = '6a24b1a8d7ca686a0bd9ed4c';
    const token = 'a'.repeat(64);
    expect(buildFeedbackPublicUrl(branchId, token, 'whatsapp')).toContain(
      `/feedback/${branchId}/${token}?s=whatsapp`
    );
    expect(
      buildReceiptPublicUrl({ billNo: 'INV-0001', shareToken: 'sharetok' })
    ).toContain('/receipt/public/INV-0001/sharetok');
  });

  it('buildSaleNotificationLinks persists feedbackToken when missing', async () => {
    const updates = [];
    const Sale = {
      updateOne: jest.fn(async (filter, patch) => {
        updates.push({ filter, patch });
      }),
    };
    const sale = { _id: 'sale1', billNo: 'INV-9', shareToken: 'stok' };
    const links = await buildSaleNotificationLinks(Sale, 'branch1', sale, 'whatsapp');
    expect(links.receiptLink).toContain('INV-9/stok');
    expect(links.feedbackLink).toContain('/feedback/branch1/');
    expect(Sale.updateOne).toHaveBeenCalled();
    expect(updates[0].patch.$set.feedbackToken).toHaveLength(64);
  });

  it('canUseReceiptFeedbackLink is false on Starter and true on Growth', () => {
    expect(canUseReceiptFeedbackLink({ plan: { planId: 'starter' } })).toBe(false);
    expect(canUseReceiptFeedbackLink({ plan: { planId: 'growth' } })).toBe(true);
    expect(canUseReceiptFeedbackLink({ plan: { planId: 'pro' } })).toBe(true);
  });

  it('resolveReceiptFeedbackLinkForSend gates by plan and business toggle', () => {
    const link = 'https://example.com/feedback/branch/token?s=whatsapp';
    const growthBusiness = { plan: { planId: 'growth' } };
    const starterBusiness = { plan: { planId: 'starter' } };

    expect(
      resolveReceiptFeedbackLinkForSend(growthBusiness, { receiptNotifications: { includeFeedbackLink: true } }, link)
    ).toBe(link);
    expect(
      resolveReceiptFeedbackLinkForSend(growthBusiness, { receiptNotifications: { includeFeedbackLink: false } }, link)
    ).toBeNull();
    expect(
      resolveReceiptFeedbackLinkForSend(starterBusiness, { receiptNotifications: { includeFeedbackLink: true } }, link)
    ).toBeNull();
  });
});
