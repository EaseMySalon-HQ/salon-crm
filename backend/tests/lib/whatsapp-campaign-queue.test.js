/**
 * BullMQ campaign queue — fail-open when Redis is absent.
 */

jest.mock('../../lib/redis', () => ({
  getBullConnection: jest.fn(),
}));

const { getBullConnection } = require('../../lib/redis');

describe('whatsapp-campaign-queue', () => {
  beforeEach(() => {
    jest.resetModules();
    getBullConnection.mockReturnValue(null);
  });

  it('isQueueEnabled is false without Redis', () => {
    const { isQueueEnabled } = require('../../lib/whatsapp-campaign-queue');
    expect(isQueueEnabled()).toBe(false);
  });

  it('enqueueCampaignRun returns false without Redis', async () => {
    const { enqueueCampaignRun } = require('../../lib/whatsapp-campaign-queue');
    const ok = await enqueueCampaignRun({ campaignId: 'abc', actorId: 'user1' });
    expect(ok).toBe(false);
  });

  it('startCampaignWorker returns null without Redis', () => {
    const { startCampaignWorker } = require('../../lib/whatsapp-campaign-queue');
    expect(startCampaignWorker()).toBeNull();
  });
});
