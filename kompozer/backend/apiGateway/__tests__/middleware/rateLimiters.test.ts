/**
 * Isolated coverage for the gateway rate limiters, mounted on trivial echo
 * routes so behavior is verified without touching JWT/proxy/network layers.
 */
import express from 'express';
import request from 'supertest';
import { buildRateLimiters } from '../../src/middleware/rateLimiters';

function buildApp() {
  const { generalLimiter, authLimiter } = buildRateLimiters();
  const app = express();
  app.get('/general', generalLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/auth-route', authLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimiters', () => {
  it('generalLimiter allows normal traffic and sets RateLimit headers', async () => {
    const app = buildApp();

    const res = await request(app).get('/general');

    expect(res.status).toBe(200);
    const hasRateLimitHeader = Object.keys(res.headers).some((h) => h.toLowerCase().startsWith('ratelimit'));
    expect(hasRateLimitHeader).toBe(true);
  });

  it('authLimiter allows the first 10 requests from one IP within the window', async () => {
    const app = buildApp();

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/auth-route');
      expect(res.status).toBe(200);
    }
  });

  it('authLimiter blocks the 11th request from the same IP within the window', async () => {
    const app = buildApp();

    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/auth-route');
    }
    const res = await request(app).post('/auth-route');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.message).toEqual(expect.any(String));
  });

  it('authLimiter tracks each app/store instance independently (no cross-test leakage)', async () => {
    const freshApp = buildApp();

    const res = await request(freshApp).post('/auth-route');

    expect(res.status).toBe(200);
  });
});
