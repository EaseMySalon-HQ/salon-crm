/**
 * Refresh token rotation backed by MongoDB (main DB).
 */

const { v4: uuidv4 } = require('uuid');
const { signTenantRefresh, TOKEN_USE } = require('./auth-tokens');
const { refreshExpires } = require('../config/jwt');

function msFromRefreshExpires() {
  const m = String(refreshExpires).match(/^(\d+)([dhms])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u === 'd') return n * 86400000;
  if (u === 'h') return n * 3600000;
  if (u === 'm') return n * 60000;
  if (u === 's') return n * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

/**
 * @param {import('mongoose').Connection} mainConnection
 */
function getRefreshTokenModel(mainConnection) {
  return mainConnection.model('RefreshToken', require('../models/RefreshToken').schema);
}

/**
 * Create DB row + return signed refresh JWT (includes jti, familyId).
 */
async function createRefreshSession(mainConnection, { subjectType, userId, staffId, branchId }) {
  const RefreshToken = getRefreshTokenModel(mainConnection);
  const familyId = uuidv4();
  const jti = uuidv4();
  const expiresAt = new Date(Date.now() + msFromRefreshExpires());
  await RefreshToken.create({
    jti,
    familyId,
    subjectType,
    userId: subjectType === 'user' ? userId : undefined,
    staffId: subjectType === 'staff' ? staffId : undefined,
    branchId: branchId || undefined,
    expiresAt,
  });
  const id = subjectType === 'user' ? userId : staffId;
  const token = signTenantRefresh({ id, branchId, jti, familyId });
  return { refreshToken: token, jti, familyId };
}

/**
 * Validate jti, rotate: revoke old row, insert new jti, return new refresh JWT.
 * If jti was already revoked → possible reuse → revoke whole family.
 */
async function rotateRefreshSession(mainConnection, decoded) {
  const { jti, familyId, branchId, tokenUse } = decoded;
  if (tokenUse !== TOKEN_USE.tenantRefresh || !jti || !familyId) {
    return { ok: false, reason: 'INVALID_REFRESH_PAYLOAD' };
  }
  const RefreshToken = getRefreshTokenModel(mainConnection);
  const row = await RefreshToken.findOne({ jti });
  if (!row) {
    return { ok: false, reason: 'REFRESH_REUSE_OR_INVALID' };
  }
  if (row.revoked) {
    await RefreshToken.updateMany({ familyId: row.familyId }, { $set: { revoked: true, revokedAt: new Date() } });
    return { ok: false, reason: 'REFRESH_REUSE_OR_INVALID' };
  }
  if (row.expiresAt && row.expiresAt < new Date()) {
    return { ok: false, reason: 'REFRESH_EXPIRED' };
  }

  const newJti = uuidv4();
  const expiresAt = new Date(Date.now() + msFromRefreshExpires());
  row.revoked = true;
  row.revokedAt = new Date();
  await row.save();
  await RefreshToken.create({
    jti: newJti,
    familyId: row.familyId,
    subjectType: row.subjectType,
    userId: row.userId,
    staffId: row.staffId,
    branchId: row.branchId,
    expiresAt,
  });

  const subjectId = row.subjectType === 'user' ? row.userId : row.staffId;
  const token = signTenantRefresh({
    id: subjectId,
    branchId: row.branchId || branchId,
    jti: newJti,
    familyId: row.familyId,
  });
  return { ok: true, refreshToken: token };
}

async function revokeRefreshFamily(mainConnection, familyId) {
  if (!familyId) return;
  const RefreshToken = getRefreshTokenModel(mainConnection);
  await RefreshToken.updateMany(
    { familyId },
    { $set: { revoked: true, revokedAt: new Date() } }
  );
}

module.exports = {
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshFamily,
  getRefreshTokenModel,
};
