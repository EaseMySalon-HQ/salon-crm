jest.mock('../../lib/redis', () => ({
  getBullConnection: jest.fn(),
}));

const { getBullConnection } = require('../../lib/redis');

describe('legacy-campaign-queue', () => {
  beforeEach(() => {
    jest.resetModules();
    getBullConnection.mockReturnValue(null);
  });

  it('isQueueEnabled is false without Redis', () => {
    const { isQueueEnabled } = require('../../lib/legacy-campaign-queue');
    expect(isQueueEnabled()).toBe(false);
  });

  it('enqueueLegacyCampaignRun returns false without Redis', async () => {
    const { enqueueLegacyCampaignRun } = require('../../lib/legacy-campaign-queue');
    const ok = await enqueueLegacyCampaignRun({ campaignId: 'c1', businessId: 'b1' });
    expect(ok).toBe(false);
  });
});
