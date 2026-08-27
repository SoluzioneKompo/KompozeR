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
