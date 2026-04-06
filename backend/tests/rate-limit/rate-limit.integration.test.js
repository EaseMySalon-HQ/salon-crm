/**
 * Integration tests for express-rate-limit wiring (memory store; no external Redis).
 * Uses jest.resetModules() + env before each require of middleware/rate-limit.js.
 */

const request = require('supertest');
const express = require('express');

function buildAppWithRateLimit() {
  const { logger } = require('../../utils/logger');
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  const rl = require('../../middleware/rate-limit');
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());
  app.use('/api', rl.generalApiLimiter);
  rl.AUTH_PATH_PREFIXES.forEach((p) => app.use(p, rl.authClusterLimiter));
  app.get('/api/ping', (req, res) => res.json({ success: true }));
  app.post('/api/auth/login', (req, res) => res.json({ success: true }));
  return app;
}

describe('rate limiting (integration)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows requests under the global limit (200)', () => {
    jest.resetModules();
    process.env.RATE_LIMIT_ENABLED = '1';
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    process.env.RATE_LIMIT_GLOBAL_MAX = '10';
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = '600000';
    process.env.RATE_LIMIT_AUTH_MAX = '25';
    process.env.RATE_LIMIT_AUTH_WINDOW_MS = '600000';

    const app = buildAppWithRateLimit();
    return request(app).get('/api/ping').expect(200).expect((res) => {
      expect(res.body.success).toBe(true);
    });
  });

  it('returns 429 with expected JSON when global limit is exceeded', () => {
    jest.resetModules();
    process.env.RATE_LIMIT_ENABLED = '1';
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    process.env.RATE_LIMIT_GLOBAL_MAX = '5';
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = '600000';
    process.env.RATE_LIMIT_AUTH_MAX = '25';
    process.env.RATE_LIMIT_AUTH_WINDOW_MS = '600000';

    const app = buildAppWithRateLimit();
    const agent = request.agent(app);
    const run = async () => {
      for (let i = 0; i < 5; i++) {
        await agent.get('/api/ping').expect(200);
      }
      const res = await agent.get('/api/ping').expect(429);
      expect(res.body).toEqual(
        expect.objectContaining({
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );
      // draft-7 uses a combined `RateLimit` header (see express-rate-limit setDraft7Headers)
      const rateHdr =
        res.headers.ratelimit ||
        res.headers['ratelimit-policy'] ||
        res.headers['RateLimit-Limit'];
      expect(rateHdr).toBeDefined();
    };
    return run();
  });

  it('applies a stricter auth limiter than global for /api/auth/login', () => {
    jest.resetModules();
    process.env.RATE_LIMIT_ENABLED = '1';
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    process.env.RATE_LIMIT_GLOBAL_MAX = '100';
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = '600000';
    process.env.RATE_LIMIT_AUTH_MAX = '2';
    process.env.RATE_LIMIT_AUTH_WINDOW_MS = '600000';

    const app = buildAppWithRateLimit();
    const body = { email: 'u@example.com', password: 'x' };
    return request(app)
      .post('/api/auth/login')
      .send(body)
      .expect(200)
      .then(() => request(app).post('/api/auth/login').send(body).expect(200))
      .then(() => request(app).post('/api/auth/login').send(body).expect(429))
      .then((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            success: false,
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
          })
        );
        return request(app).get('/api/ping').expect(200);
      });
  });
});
