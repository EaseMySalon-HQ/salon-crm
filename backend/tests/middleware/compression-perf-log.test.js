/**
 * Integration coverage for the new compression + perf-log middleware wiring.
 * Builds a minimal Express app that mirrors the production middleware order so we can
 * verify that:
 *   - Large JSON responses are gzip/br compressed.
 *   - Small responses (below the 1024-byte threshold) are not compressed.
 *   - The `X-No-Compression` opt-out is honored.
 *   - `/health` probes stay uncompressed and lightweight.
 *   - The perf-log middleware never breaks the response.
 */

const request = require('supertest');
const express = require('express');
const compression = require('compression');

const { perfLogMiddleware } = require('../../middleware/perf-log');

function buildApp() {
  const app = express();
  app.use(perfLogMiddleware);
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        const p = req.path || '';
        if (p === '/health' || p === '/api/health') return false;
        return compression.filter(req, res);
      },
    })
  );
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.get('/small', (req, res) => res.json({ hi: 'world' }));
  app.get('/large', (req, res) => {
    const big = { items: Array.from({ length: 200 }, (_, i) => ({ i, msg: 'lorem ipsum dolor sit amet'.repeat(2) })) };
    res.json(big);
  });
  return app;
}

describe('compression + perf-log integration', () => {
  const app = buildApp();

  it('compresses payloads above the threshold', async () => {
    const res = await request(app)
      .get('/large')
      .set('Accept-Encoding', 'gzip, br, deflate');
    expect(res.status).toBe(200);
    expect(['gzip', 'br', 'deflate']).toContain(res.headers['content-encoding']);
  });

  it('does not compress small payloads', async () => {
    const res = await request(app)
      .get('/small')
      .set('Accept-Encoding', 'gzip, br, deflate');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('honors X-No-Compression opt-out', async () => {
    const res = await request(app)
      .get('/large')
      .set('Accept-Encoding', 'gzip')
      .set('X-No-Compression', '1');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('leaves /health uncompressed for probes', async () => {
    const res = await request(app)
      .get('/health')
      .set('Accept-Encoding', 'gzip, br');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body).toEqual({ ok: true });
  });
});
