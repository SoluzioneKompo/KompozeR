/**
 * App-level test for gateway error handling that only makes sense wired
 * through the full app (express.json() runs before any route/middleware).
 */
import request from 'supertest';
import { buildApp } from '../src/app';

const SERVICES = {
  auth: 'http://auth:3001',
  catalog: 'http://catalog:3002',
  cad: 'http://cad:3003',
  cart: 'http://cart:3004',
  order: 'http://order:3008',
  notification: 'http://notification:3005',
  chatbot: 'http://chatbot:3006',
  reporting: 'http://reporting:3007',
};

describe('gateway app — malformed JSON body', () => {
  it('POST /auth/login with syntactically invalid JSON -> 400 INVALID_REQUEST', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', services: SERVICES });

    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});

describe('gateway app — rate limiting', () => {
  it('applies the general limiter to every request (RateLimit headers present)', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', services: SERVICES });

    const res = await request(app).get('/some/protected/route');

    const hasRateLimitHeader = Object.keys(res.headers).some((h) => h.toLowerCase().startsWith('ratelimit'));
    expect(hasRateLimitHeader).toBe(true);
  });

  it('does not apply the tight auth limiter to unrelated routes', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', services: SERVICES });

    // 11 requests to a route the auth limiter does not cover (401s fast, no
    // network calls) — none should be blocked by the 10-request auth limiter.
    let lastRes;
    for (let i = 0; i < 11; i += 1) {
      lastRes = await request(app).get('/some/protected/route');
    }

    expect(lastRes!.status).toBe(401);
  });
});
