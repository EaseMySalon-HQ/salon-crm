jest.mock('../../lib/redis', () => ({
  getBullConnection: jest.fn(),
}));

const { getBullConnection } = require('../../lib/redis');

describe('legacy-campaign-runner', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.LEGACY_CAMPAIGN_MAX_RECIPIENTS;
    delete process.env.LEGACY_CAMPAIGN_INPROCESS_MAX;
    getBullConnection.mockReturnValue(null);
  });

  it('getMaxRecipients defaults to 500 without Redis', () => {
    const { getMaxRecipients } = require('../../lib/legacy-campaign-runner');
    expect(getMaxRecipients()).toBe(500);
  });

  it('getRecipientsForCampaign maps all_clients', async () => {
    const { getRecipientsForCampaign } = require('../../lib/legacy-campaign-runner');
    const businessModels = {
      Client: {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { phone: '919999999999', name: 'A', email: 'a@b.com' },
              ]),
            }),
          }),
        }),
      },
    };
    const recipients = await getRecipientsForCampaign(
      { recipientType: 'all_clients' },
      'biz1',
      businessModels
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0].phone).toBe('919999999999');
  });
});
