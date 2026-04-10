/**
 * Unit tests for refresh-token rotation (lib/refresh-session.js).
 * Uses mongodb-memory-server so nothing touches the real DB.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../config/jwt');
const { TOKEN_USE } = require('../../lib/auth-tokens');
const {
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshFamily,
  getRefreshTokenModel,
} = require('../../lib/refresh-session');

let mongoServer;
let conn;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  conn = await mongoose.createConnection(mongoServer.getUri()).asPromise();
});

afterAll(async () => {
  await conn.close();
  await mongoServer.stop();
});

afterEach(async () => {
  const RefreshToken = getRefreshTokenModel(conn);
  await RefreshToken.deleteMany({});
});

describe('createRefreshSession', () => {
  it('persists a row and returns a signed JWT with jti + familyId', async () => {
    const userId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    const result = await createRefreshSession(conn, {
      subjectType: 'user',
      userId,
      branchId,
    });

    expect(result.refreshToken).toBeDefined();
    expect(result.jti).toBeDefined();
    expect(result.familyId).toBeDefined();

    const decoded = jwt.verify(result.refreshToken, JWT_SECRET);
    expect(decoded.tokenUse).toBe(TOKEN_USE.tenantRefresh);
    expect(decoded.jti).toBe(result.jti);
    expect(decoded.familyId).toBe(result.familyId);
    expect(String(decoded.id)).toBe(String(userId));

    const RefreshToken = getRefreshTokenModel(conn);
    const row = await RefreshToken.findOne({ jti: result.jti });
    expect(row).not.toBeNull();
    expect(row.subjectType).toBe('user');
    expect(String(row.userId)).toBe(String(userId));
    expect(row.revoked).toBe(false);
  });

  it('stores staffId (not userId) for staff sessions', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    const result = await createRefreshSession(conn, {
      subjectType: 'staff',
      staffId,
      branchId,
    });

    const RefreshToken = getRefreshTokenModel(conn);
    const row = await RefreshToken.findOne({ jti: result.jti });
    expect(row.subjectType).toBe('staff');
    expect(String(row.staffId)).toBe(String(staffId));
    expect(row.userId).toBeUndefined();
  });
});

describe('rotateRefreshSession', () => {
  it('revokes the old jti and returns a new refresh token', async () => {
    const userId = new mongoose.Types.ObjectId();
    const { refreshToken, jti: oldJti, familyId } = await createRefreshSession(conn, {
      subjectType: 'user',
      userId,
      branchId: new mongoose.Types.ObjectId(),
    });

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const result = await rotateRefreshSession(conn, decoded);

    expect(result.ok).toBe(true);
    expect(result.refreshToken).toBeDefined();

    const RefreshToken = getRefreshTokenModel(conn);
    const oldRow = await RefreshToken.findOne({ jti: oldJti });
    expect(oldRow.revoked).toBe(true);
    expect(oldRow.revokedAt).toBeInstanceOf(Date);

    const newDecoded = jwt.verify(result.refreshToken, JWT_SECRET);
    expect(newDecoded.familyId).toBe(familyId);
    expect(newDecoded.jti).not.toBe(oldJti);

    const newRow = await RefreshToken.findOne({ jti: newDecoded.jti });
    expect(newRow).not.toBeNull();
    expect(newRow.revoked).toBe(false);
  });

  it('rejects an already-revoked jti and revokes the entire family', async () => {
    const userId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    const { refreshToken } = await createRefreshSession(conn, {
      subjectType: 'user',
      userId,
      branchId,
    });

    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    // First rotation succeeds
    const first = await rotateRefreshSession(conn, decoded);
    expect(first.ok).toBe(true);

    // Replay the same token (reuse attack)
    const replay = await rotateRefreshSession(conn, decoded);
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe('REFRESH_REUSE_OR_INVALID');

    // Entire family should be revoked
    const RefreshToken = getRefreshTokenModel(conn);
    const rows = await RefreshToken.find({ familyId: decoded.familyId });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((row) => expect(row.revoked).toBe(true));
  });

  it('rejects an unknown jti', async () => {
    const fakeDecoded = {
      id: new mongoose.Types.ObjectId().toString(),
      tokenUse: TOKEN_USE.tenantRefresh,
      jti: 'nonexistent-jti',
      familyId: 'nonexistent-family',
    };
    const result = await rotateRefreshSession(conn, fakeDecoded);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('REFRESH_REUSE_OR_INVALID');
  });

  it('rejects invalid tokenUse', async () => {
    const result = await rotateRefreshSession(conn, {
      tokenUse: TOKEN_USE.tenantAccess,
      jti: 'x',
      familyId: 'y',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('INVALID_REFRESH_PAYLOAD');
  });

  it('rejects missing jti or familyId', async () => {
    const r1 = await rotateRefreshSession(conn, {
      tokenUse: TOKEN_USE.tenantRefresh,
      familyId: 'y',
    });
    expect(r1.ok).toBe(false);

    const r2 = await rotateRefreshSession(conn, {
      tokenUse: TOKEN_USE.tenantRefresh,
      jti: 'x',
    });
    expect(r2.ok).toBe(false);
  });

  it('rejects an expired row', async () => {
    const userId = new mongoose.Types.ObjectId();
    const RefreshToken = getRefreshTokenModel(conn);
    const familyId = 'expired-family';
    const jti = 'expired-jti';
    await RefreshToken.create({
      jti,
      familyId,
      subjectType: 'user',
      userId,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await rotateRefreshSession(conn, {
      tokenUse: TOKEN_USE.tenantRefresh,
      jti,
      familyId,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('REFRESH_EXPIRED');
  });
});

describe('revokeRefreshFamily', () => {
  it('revokes all rows in a family', async () => {
    const userId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    const { refreshToken, familyId } = await createRefreshSession(conn, {
      subjectType: 'user',
      userId,
      branchId,
    });

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    await rotateRefreshSession(conn, decoded);

    const RefreshToken = getRefreshTokenModel(conn);
    const before = await RefreshToken.find({ familyId, revoked: false });
    expect(before.length).toBe(1);

    await revokeRefreshFamily(conn, familyId);

    const after = await RefreshToken.find({ familyId, revoked: false });
    expect(after.length).toBe(0);

    const allRevoked = await RefreshToken.find({ familyId });
    allRevoked.forEach((row) => expect(row.revoked).toBe(true));
  });

  it('is a no-op when familyId is falsy', async () => {
    await expect(revokeRefreshFamily(conn, null)).resolves.toBeUndefined();
    await expect(revokeRefreshFamily(conn, undefined)).resolves.toBeUndefined();
  });
});
