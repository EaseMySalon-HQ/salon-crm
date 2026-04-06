const mongoose = require('mongoose');
const databaseManager = require('../config/database-manager');
const { logger } = require('./logger');
const { getClientIp } = require('./admin-logger');

/**
 * Infer coarse client channel for audit metadata (not security-critical).
 */
function inferMetadataSource(req) {
  if (!req || !req.headers) return 'api';
  const ua = String(req.headers['user-agent'] || '');
  if (!ua) return 'api';
  if (/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'mobile';
  }
  if (/Mozilla|Chrome|Safari|Firefox|Edge|Edg\//i.test(ua)) {
    return 'web';
  }
  return 'api';
}

/**
 * Map tenant JWT principal to actorType for activity_logs (salon admin vs staff vs manager).
 */
function tenantActorTypeFromRole(role) {
  return role === 'admin' ? 'admin' : 'staff';
}

/**
 * Persist one activity row. Callers should not await in the request path; use scheduleActivityLog.
 *
 * @param {object} payload
 * @param {string|mongoose.Types.ObjectId} payload.businessId
 * @param {'admin'|'staff'|'system'} payload.actorType
 * @param {string|mongoose.Types.ObjectId|null} [payload.actorId]
 * @param {string} payload.action
 * @param {string} [payload.entity]
 * @param {string|mongoose.Types.ObjectId|null} [payload.entityId]
 * @param {string} payload.summary
 * @param {object} [payload.metadata] — merged with IP/UA/source when `req` is passed
 * @param {import('express').Request} [req] — optional; enriches metadata.ip, metadata.userAgent, metadata.source
 * @returns {Promise<void>}
 */
async function logActivity(payload, req) {
  try {
    const {
      businessId,
      actorType,
      actorId,
      action,
      entity = '',
      entityId,
      summary,
      metadata: extraMetadata = {},
    } = payload;

    if (!businessId || !action || !summary) {
      logger.warn('activity-logger: missing required fields', { businessId: !!businessId, action, summary: !!summary });
      return;
    }

    let bid;
    if (businessId instanceof mongoose.Types.ObjectId) {
      bid = businessId;
    } else if (businessId != null && mongoose.Types.ObjectId.isValid(String(businessId))) {
      bid = new mongoose.Types.ObjectId(String(businessId));
    } else {
      logger.warn('activity-logger: invalid businessId');
      return;
    }

    let meta = { ...extraMetadata };
    if (req) {
      meta = {
        ...meta,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 2000),
        source: inferMetadataSource(req),
      };
    }

    let eid = entityId;
    if (eid != null && typeof eid === 'string' && mongoose.Types.ObjectId.isValid(eid)) {
      eid = new mongoose.Types.ObjectId(eid);
    }

    let aid = actorId;
    if (aid != null && typeof aid === 'string' && mongoose.Types.ObjectId.isValid(aid)) {
      aid = new mongoose.Types.ObjectId(aid);
    }

    const mainConnection = await databaseManager.getMainConnection();
    const ActivityLog = mainConnection.model('ActivityLog', require('../models/ActivityLog').schema);

    await ActivityLog.create({
      businessId: bid,
      actorType,
      actorId: aid != null ? aid : null,
      action,
      entity: entity || '',
      entityId: eid != null ? eid : null,
      summary: String(summary).slice(0, 2000),
      metadata: {
        ip: meta.ip || '',
        userAgent: meta.userAgent || '',
        source: meta.source || 'api',
      },
      createdAt: new Date(),
    });
  } catch (error) {
    logger.error('activity-logger: failed to write ActivityLog', error);
  }
}

/**
 * Fire-and-forget: never blocks or throws to the caller.
 */
function scheduleActivityLog(payload, req) {
  void logActivity(payload, req).catch((err) => logger.error('activity-logger: schedule failed', err));
}

module.exports = {
  logActivity,
  scheduleActivityLog,
  inferMetadataSource,
  tenantActorTypeFromRole,
};
