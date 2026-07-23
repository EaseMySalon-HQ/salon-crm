'use strict';

const mongoose = require('mongoose');
const databaseManager = require('../config/database-manager');

function normalizeCampaignId(campaignId) {
  if (!campaignId) return null;
  if (campaignId instanceof mongoose.Types.ObjectId) return campaignId;
  try {
    return new mongoose.Types.ObjectId(String(campaignId));
  } catch {
    return String(campaignId);
  }
}

async function getReportModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Campaign: main.model(
      'PlatformWhatsAppCampaign',
      require('../models/PlatformWhatsAppCampaign').schema
    ),
    Message: main.model(
      'PlatformWhatsAppMessage',
      require('../models/PlatformWhatsAppMessage').schema
    ),
    Template: main.model(
      'PlatformWhatsAppTemplate',
      require('../models/PlatformWhatsAppTemplate').schema
    ),
    PlatformLead: main.model('PlatformLead', require('../models/PlatformLead').schema),
  };
}

function pct(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function durationMs(start, end) {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

async function aggregateMessageCounts(campaignId) {
  const { Message } = await getReportModels();
  const normalizedCampaignId = normalizeCampaignId(campaignId);
  const match = {
    direction: 'outbound',
    ...(normalizedCampaignId
      ? { campaignId: normalizedCampaignId }
      : { campaignId: { $ne: null } }),
  };
  const rows = await Message.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  for (const row of rows) {
    const key = String(row._id || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] = row.count;
    }
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const attempted = total - counts.queued;
  const successful = counts.sent + counts.delivered + counts.read;
  return {
    ...counts,
    total,
    attempted,
    successful,
    deliveryRate: pct(counts.delivered + counts.read, successful || attempted),
    readRate: pct(counts.read, counts.delivered + counts.read),
    failureRate: pct(counts.failed, attempted),
  };
}

/** Recompute campaign.counts from outbound message rows (source of truth). */
async function reconcileCampaignCounts(campaignId) {
  const { Campaign } = await getReportModels();
  const metrics = await aggregateMessageCounts(campaignId);
  await Campaign.updateOne(
    { _id: campaignId },
    {
      $set: {
        counts: {
          queued: metrics.queued,
          sent: metrics.sent,
          delivered: metrics.delivered,
          read: metrics.read,
          failed: metrics.failed,
        },
      },
    }
  );
  return metrics;
}

/** Batch aggregate for campaign list screens. */
async function aggregateMessageCountsForCampaigns(campaignIds) {
  const ids = (campaignIds || []).filter(Boolean).map((id) => normalizeCampaignId(id));
  const empty = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  if (!ids.length) return new Map();

  const { Message } = await getReportModels();
  const rows = await Message.aggregate([
    {
      $match: {
        direction: 'outbound',
        campaignId: { $in: ids },
      },
    },
    {
      $group: {
        _id: { campaignId: '$campaignId', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byCampaign = new Map(ids.map((id) => [String(id), { ...empty }]));
  for (const row of rows) {
    const cid = String(row._id.campaignId);
    const bucket = byCampaign.get(cid);
    if (!bucket) continue;
    const key = String(row._id.status || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(bucket, key)) {
      bucket[key] = row.count;
    }
  }
  return byCampaign;
}

async function topFailureReasons(campaignId, limit = 5) {
  const { Message } = await getReportModels();
  const normalizedCampaignId = normalizeCampaignId(campaignId);
  return Message.aggregate([
    {
      $match: {
        campaignId: normalizedCampaignId,
        direction: 'outbound',
        status: 'failed',
        failureReason: { $exists: true, $nin: [null, ''] },
      },
    },
    { $group: { _id: '$failureReason', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { reason: '$_id', count: 1, _id: 0 } },
  ]);
}

async function attachLeadsToRecipients(messages) {
  if (!messages.length) return [];
  const { PlatformLead } = await getReportModels();
  const leadIds = messages.map((m) => m.platformLeadId).filter(Boolean);
  const suffixes = messages.map((m) =>
    String(m.recipientPhone || '').replace(/\D/g, '').slice(-10)
  );
  const or = [];
  if (leadIds.length) or.push({ _id: { $in: leadIds } });
  for (const suffix of [...new Set(suffixes.filter(Boolean))]) {
    or.push({ phone: { $regex: `${suffix}$` } });
  }
  const leads = or.length
    ? await PlatformLead.find({ $or: or })
        .select('_id name firstName salonName phone status')
        .lean()
    : [];
  const byId = new Map(leads.map((l) => [String(l._id), l]));
  const bySuffix = new Map();
  for (const lead of leads) {
    const suffix = String(lead.phone || '').replace(/\D/g, '').slice(-10);
    if (suffix && !bySuffix.has(suffix)) bySuffix.set(suffix, lead);
  }

  return messages.map((m) => {
    const direct = m.platformLeadId ? byId.get(String(m.platformLeadId)) : null;
    const suffix = String(m.recipientPhone || '').replace(/\D/g, '').slice(-10);
    const lead = direct || (suffix ? bySuffix.get(suffix) : null);
    return {
      messageId: m._id,
      recipientPhone: m.recipientPhone,
      status: m.status,
      failureReason: m.failureReason || null,
      timestamp: m.timestamp,
      lead: lead
        ? {
            _id: lead._id,
            name: lead.name || lead.firstName || '',
            salonName: lead.salonName || '',
            status: lead.status || '',
          }
        : null,
    };
  });
}

async function buildCampaignPerformanceReport(campaignId) {
  const { Campaign, Message, Template } = await getReportModels();
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) return null;

  const template = campaign.templateId
    ? await Template.findById(campaign.templateId).select('name category language status').lean()
    : null;

  const metrics = await reconcileCampaignCounts(campaignId);
  const failureReasons = await topFailureReasons(campaignId);

  const rawMessages = await Message.find({
    campaignId,
    direction: 'outbound',
  })
    .sort({ timestamp: -1 })
    .limit(200)
    .select('recipientPhone status failureReason timestamp platformLeadId')
    .lean();

  const recipients = await attachLeadsToRecipients(rawMessages);

  const duration = durationMs(campaign.startedAt, campaign.completedAt);

  return {
    campaign: {
      _id: campaign._id,
      name: campaign.name,
      description: campaign.description || '',
      status: campaign.status,
      failureReason: campaign.failureReason || null,
      recipientCount: campaign.recipientCount || 0,
      audienceType: campaign.audienceType,
      audienceFilters: campaign.audienceFilters || {},
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      createdAt: campaign.createdAt,
      counts: {
        queued: metrics.queued,
        sent: metrics.sent,
        delivered: metrics.delivered,
        read: metrics.read,
        failed: metrics.failed,
      },
    },
    template: template
      ? {
          _id: template._id,
          name: template.name,
          category: template.category,
          language: template.language,
          status: template.status,
        }
      : null,
    metrics,
    rates: {
      deliveryRate: metrics.deliveryRate,
      readRate: metrics.readRate,
      failureRate: metrics.failureRate,
    },
    failureReasons,
    durationMs: duration,
    recipients,
  };
}

async function buildCampaignsSummaryReport() {
  const { Campaign } = await getReportModels();
  const campaigns = await Campaign.find({})
    .sort({ createdAt: -1 })
    .select('name status recipientCount counts startedAt completedAt createdAt failureReason')
    .lean();

  const overall = await aggregateMessageCounts(null);

  const byStatus = {};
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  const recent = campaigns.slice(0, 10).map((c) => ({
    _id: c._id,
    name: c.name,
    status: c.status,
    recipientCount: c.recipientCount || 0,
    counts: c.counts || {},
    createdAt: c.createdAt,
    completedAt: c.completedAt,
  }));

  const countMap = await aggregateMessageCountsForCampaigns(campaigns.map((c) => c._id));
  for (const c of campaigns) {
    c.counts = countMap.get(String(c._id)) || c.counts;
  }
  for (const c of recent) {
    c.counts = countMap.get(String(c._id)) || c.counts;
  }

  return {
    totals: {
      campaigns: campaigns.length,
      ...overall,
      deliveryRate: overall.deliveryRate,
      readRate: overall.readRate,
      failureRate: overall.failureRate,
    },
    campaignsByStatus: byStatus,
    recentCampaigns: recent,
  };
}

module.exports = {
  buildCampaignPerformanceReport,
  buildCampaignsSummaryReport,
  aggregateMessageCounts,
  aggregateMessageCountsForCampaigns,
  reconcileCampaignCounts,
};
