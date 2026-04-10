/**
 * Unit tests for middleware/csrf.js — double-submit cookie validation.
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

let csrfModule;

function buildApp() {
  jest.resetModules();
  process.env.CSRF_ENABLED = '1';
  csrfModule = require('../../middleware/csrf');
  const { csrfProtection, setCsrfCookie, CSRF_COOKIE } = csrfModule;

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(csrfProtection);

  app.get('/api/auth/csrf', (req, res) => {
    const token = setCsrfCookie(res);
    res.json({ success: true, csrfToken: token });
  });
  app.post('/api/auth/login', (req, res) => res.json({ ok: true }));
  app.post('/api/auth/refresh', (req, res) => res.json({ ok: true }));
  app.post('/api/test/action', (req, res) => res.json({ ok: true }));
  app.put('/api/test/update', (req, res) => res.json({ ok: true }));
  app.delete('/api/test/remove', (req, res) => res.json({ ok: true }));
  app.get('/api/test/read', (req, res) => res.json({ ok: true }));
  return app;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CSRF skip rules', () => {
  it('skips GET requests', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/test/read');
    expect(res.status).toBe(200);
  });

  it('skips POST /api/auth/login', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(200);
  });

  it('skips POST /api/auth/refresh', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(200);
  });
});

describe('CSRF enforcement on mutating requests', () => {
  it('rejects POST without CSRF token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/test/action').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF/i);
  });

  it('rejects PUT without CSRF token', async () => {
    const app = buildApp();
    const res = await request(app).put('/api/test/update').send({});
    expect(res.status).toBe(403);
  });

  it('rejects DELETE without CSRF token', async () => {
    const app = buildApp();
    const res = await request(app).delete('/api/test/remove');
    expect(res.status).toBe(403);
  });

  it('rejects when cookie and header mismatch', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/test/action')
      .set('Cookie', 'ems_csrf=token-a')
      .set('X-CSRF-Token', 'token-b')
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('CSRF double-submit pass', () => {
  it('allows POST when cookie and X-CSRF-Token header match', async () => {
    const app = buildApp();
    const csrfRes = await request(app).get('/api/auth/csrf');
    const csrfToken = csrfRes.body.csrfToken;

    const cookies = csrfRes.headers['set-cookie'];
    const csrfCookie = cookies.find((c) => c.startsWith('ems_csrf='));

    const res = await request(app)
      .post('/api/test/action')
      .set('Cookie', csrfCookie.split(';')[0])
      .set('X-CSRF-Token', csrfToken)
      .send({});
    expect(res.status).toBe(200);
  });

  it('allows POST with X-XSRF-Token header (alternative name)', async () => {
    const app = buildApp();
    const csrfRes = await request(app).get('/api/auth/csrf');
    const csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    const csrfCookie = cookies.find((c) => c.startsWith('ems_csrf='));

    const res = await request(app)
      .post('/api/test/action')
      .set('Cookie', csrfCookie.split(';')[0])
      .set('X-XSRF-Token', csrfToken)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe('CSRF disabled via env', () => {
  it('allows all requests when CSRF_ENABLED=0', async () => {
    jest.resetModules();
    process.env.CSRF_ENABLED = '0';
    const { csrfProtection } = require('../../middleware/csrf');

    const app = express();
    app.use(cookieParser());
    app.use(csrfProtection);
    app.post('/api/test/action', (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/api/test/action').send({});
    expect(res.status).toBe(200);
    delete process.env.CSRF_ENABLED;
  });
});

describe('Bearer token bypass', () => {
  it('still allows requests with Bearer token (backward compat for external API clients)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/test/action')
      .set('Authorization', 'Bearer some-valid-token-12345')
      .send({});
    expect(res.status).toBe(200);
  });
});
