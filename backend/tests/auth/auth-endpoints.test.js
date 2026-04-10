/**
 * Integration tests for auth endpoints.
 *
 * Builds a lightweight Express app using the real auth-tokens, CSRF, and
 * refresh-session modules against mongodb-memory-server.
 *
 * Verifies:
 *  - Login response contains NO token in body (cookie-only)
 *  - Login sets HttpOnly access + refresh cookies
 *  - Refresh rotates tokens via cookies (no token in body)
 *  - Logout clears cookies and revokes refresh family in DB
 *  - Cookie-authenticated requests work (no Bearer required)
 *  - CSRF is enforced for cookie-only mutating requests
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { JWT_SECRET } = require('../../config/jwt');
const {
  COOKIE,
  TOKEN_USE,
  signTenantAccess,
  setTenantAuthCookies,
  clearTenantAuthCookies,
} = require('../../lib/auth-tokens');
const { csrfProtection, setCsrfCookie, CSRF_COOKIE } = require('../../middleware/csrf');
const {
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshFamily,
  getRefreshTokenModel,
} = require('../../lib/refresh-session');

let mongoServer;
let conn;

const TEST_USER = {
  email: 'test@salon.com',
  password: 'TestPass123!',
  role: 'admin',
};

let testUserId;
let testBranchId;

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(csrfProtection);

  // --- POST /api/auth/login (mirrors server.js logic) ---
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (email !== TEST_USER.email || password !== TEST_USER.password) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = { _id: testUserId, email, role: TEST_USER.role, branchId: testBranchId };
    const { refreshToken } = await createRefreshSession(conn, {
      subjectType: 'user',
      userId: user._id,
      branchId: user.branchId,
    });
    const accessToken = signTenantAccess(user);
    setTenantAuthCookies(res, { accessToken, refreshToken });
    const csrfToken = setCsrfCookie(res);

    res.json({
      success: true,
      data: {
        user: { _id: user._id, email: user.email, role: user.role },
        csrfToken,
      },
    });
  });

  // --- POST /api/auth/refresh (mirrors server.js cookie-path) ---
  app.post('/api/auth/refresh', async (req, res) => {
    const refreshCookie = req.cookies && req.cookies[COOKIE.tenantRefresh];
    if (!refreshCookie) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }

    let rdecoded;
    try {
      rdecoded = jwt.verify(refreshCookie, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    if (rdecoded.tokenUse !== TOKEN_USE.tenantRefresh || !rdecoded.id) {
      return res.status(403).json({ success: false, error: 'Invalid refresh token' });
    }

    let newRefreshToken = refreshCookie;
    if (rdecoded.jti && rdecoded.familyId) {
      const rotated = await rotateRefreshSession(conn, rdecoded);
      if (!rotated.ok) {
        return res.status(401).json({ success: false, error: 'Token rotation failed' });
      }
      newRefreshToken = rotated.refreshToken;
    }

    const newAccess = signTenantAccess({
      _id: rdecoded.id,
      email: TEST_USER.email,
      role: TEST_USER.role,
      branchId: rdecoded.branchId,
    });
    setTenantAuthCookies(res, { accessToken: newAccess, refreshToken: newRefreshToken });
    return res.json({ success: true });
  });

  // --- POST /api/auth/logout ---
  app.post('/api/auth/logout', async (req, res) => {
    const accessCookie = req.cookies && req.cookies[COOKIE.tenantAccess];
    if (!accessCookie) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    try {
      const refreshCookie = req.cookies[COOKIE.tenantRefresh];
      if (refreshCookie) {
        const decoded = jwt.decode(refreshCookie);
        if (decoded && decoded.familyId) {
          await revokeRefreshFamily(conn, decoded.familyId);
        }
      }
    } catch { /* best effort */ }

    clearTenantAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // --- Protected endpoint (requires cookie auth + CSRF) ---
  app.post('/api/test/protected', (req, res) => {
    const token = req.cookies && req.cookies[COOKIE.tenantAccess];
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return res.json({ success: true, userId: decoded.id });
    } catch {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
  });

  app.get('/api/test/read', (req, res) => {
    const token = req.cookies && req.cookies[COOKIE.tenantAccess];
    if (!token) return res.status(401).json({ success: false });
    try {
      jwt.verify(token, JWT_SECRET);
      return res.json({ success: true });
    } catch {
      return res.status(403).json({ success: false });
    }
  });

  return app;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  conn = await mongoose.createConnection(mongoServer.getUri()).asPromise();
  testUserId = new mongoose.Types.ObjectId();
  testBranchId = new mongoose.Types.ObjectId();
});

afterAll(async () => {
  await conn.close();
  await mongoServer.stop();
});

afterEach(async () => {
  const RefreshToken = getRefreshTokenModel(conn);
  await RefreshToken.deleteMany({});
});

function extractCookies(res) {
  const raw = res.headers['set-cookie'] || [];
  const map = {};
  raw.forEach((c) => {
    const [nameVal] = c.split(';');
    const [name, ...rest] = nameVal.split('=');
    map[name.trim()] = rest.join('=');
  });
  return map;
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  it('returns user + csrfToken but NOT a token field in JSON body', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.csrfToken).toBeDefined();
    expect(res.body.data.token).toBeUndefined();
  });

  it('sets HttpOnly access + refresh cookies', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const rawCookies = res.headers['set-cookie'] || [];
    const accessCookie = rawCookies.find((c) => c.startsWith(COOKIE.tenantAccess + '='));
    const refreshCookie = rawCookies.find((c) => c.startsWith(COOKIE.tenantRefresh + '='));

    expect(accessCookie).toBeDefined();
    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
  });

  it('sets a readable (non-HttpOnly) CSRF cookie', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const rawCookies = res.headers['set-cookie'] || [];
    const csrfCookie = rawCookies.find((c) => c.startsWith(CSRF_COOKIE + '='));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toMatch(/HttpOnly/i);
  });

  it('rejects invalid credentials', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/refresh', () => {
  it('rotates tokens via cookies; does NOT return token in JSON', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);
    const oldRefresh = loginCookies[COOKIE.tenantRefresh];

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(loginCookies));

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data).toBeUndefined();

    const newCookies = extractCookies(refreshRes);
    expect(newCookies[COOKIE.tenantAccess]).toBeDefined();
    expect(newCookies[COOKIE.tenantRefresh]).toBeDefined();
    expect(newCookies[COOKIE.tenantRefresh]).not.toBe(oldRefresh);
  });

  it('rejects replay of an already-rotated refresh token', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);

    // First refresh succeeds
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(loginCookies));

    // Replay with same cookies → should fail (reuse detection)
    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(loginCookies));

    expect(replay.status).toBe(401);
  });

  it('fails without refresh cookie', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  it('clears auth cookies', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);
    const csrfToken = loginRes.body.data.csrfToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(loginCookies))
      .set('X-CSRF-Token', csrfToken);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const logoutCookies = extractCookies(logoutRes);
    expect(logoutCookies[COOKIE.tenantAccess]).toBeFalsy();
  });

  it('revokes the refresh token family in the DB', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);
    const csrfToken = loginRes.body.data.csrfToken;
    const refreshJwt = loginCookies[COOKIE.tenantRefresh];
    const decoded = jwt.decode(refreshJwt);

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(loginCookies))
      .set('X-CSRF-Token', csrfToken);

    const RefreshToken = getRefreshTokenModel(conn);
    const rows = await RefreshToken.find({ familyId: decoded.familyId });
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(row.revoked).toBe(true));
  });

  it('refresh fails after logout (family revoked)', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);
    const csrfToken = loginRes.body.data.csrfToken;

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(loginCookies))
      .set('X-CSRF-Token', csrfToken);

    const refreshAttempt = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(loginCookies));

    expect(refreshAttempt.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('Cookie-based authentication (no Bearer)', () => {
  it('GET requests work with just the access cookie', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);

    const res = await request(app)
      .get('/api/test/read')
      .set('Cookie', cookieHeader(loginCookies));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST requests require CSRF header alongside cookie', async () => {
    const app = buildApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const loginCookies = extractCookies(loginRes);
    const csrfToken = loginRes.body.data.csrfToken;

    // Without CSRF → 403
    const nocsrf = await request(app)
      .post('/api/test/protected')
      .set('Cookie', cookieHeader(loginCookies))
      .send({});
    expect(nocsrf.status).toBe(403);

    // With CSRF → 200
    const withcsrf = await request(app)
      .post('/api/test/protected')
      .set('Cookie', cookieHeader(loginCookies))
      .set('X-CSRF-Token', csrfToken)
      .send({});
    expect(withcsrf.status).toBe(200);
    expect(withcsrf.body.success).toBe(true);
  });

  it('fails without any cookie', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/test/read');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('Full session lifecycle', () => {
  it('login → use → refresh → use → logout → fail', async () => {
    const app = buildApp();

    // 1. Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    expect(loginRes.status).toBe(200);
    let cookies = extractCookies(loginRes);
    const csrfToken = loginRes.body.data.csrfToken;

    // 2. Use (GET)
    const use1 = await request(app)
      .get('/api/test/read')
      .set('Cookie', cookieHeader(cookies));
    expect(use1.status).toBe(200);

    // 3. Refresh
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(cookies));
    expect(refreshRes.status).toBe(200);
    cookies = { ...cookies, ...extractCookies(refreshRes) };

    // 4. Use with refreshed cookies (POST + CSRF)
    const use2 = await request(app)
      .post('/api/test/protected')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', csrfToken)
      .send({});
    expect(use2.status).toBe(200);

    // 5. Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', csrfToken);
    expect(logoutRes.status).toBe(200);

    // 6. Post-logout: refresh should fail
    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(cookies));
    expect(afterLogout.status).toBe(401);
  });
});
