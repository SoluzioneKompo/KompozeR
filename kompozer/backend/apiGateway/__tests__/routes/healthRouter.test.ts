/**
 * TDD coverage for gateway /health endpoint.
 * Verifies aggregated status, correct HTTP codes, and latency fields.
 * Uses mocked FetchFn to isolate logic from real network dependencies.
 */
import request from 'supertest';
import express from 'express';
import { buildHealthRouter, FetchFn } from '../../src/routes/health';
import { ServiceUrls } from '../../src/routes/index';

const SERVICES: ServiceUrls = {
  auth:         'http://auth:3001',
  catalog:      'http://catalog:3002',
  cad:          'http://cad:3003',
  cart:         'http://cart:3004',
  order:        'http://order:3008',
  notification: 'http://notification:3005',
  reporting:    'http://reporting:3007',
};

/** Builds a FetchFn that returns the configured HTTP status per URL. */
function makeFetch(statusByUrl: Record<string, number>): FetchFn {
  return async (url: string) => {
    const status = statusByUrl[url] ?? 200;
    return { ok: status >= 200 && status < 300, status };
  };
}

/** FetchFn that simulates a timeout (AbortError). */
function makeTimeoutFetch(): FetchFn {
  return async (_url: string, _init?: unknown) => {
    // Immediately throws abort error, like AbortController timeout.
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };
}

function buildApp(fetchFn: FetchFn) {
  const app = express();
  app.use(buildHealthRouter(SERVICES, fetchFn));
  return app;
}

// /health endpoints for each downstream service.
const ALL_HEALTH_URLS = Object.values(SERVICES).map(u => `${u}/health`);
const ALL_UP = Object.fromEntries(ALL_HEALTH_URLS.map(u => [u, 200]));

describe('GET /health — tutti i servizi UP', () => {
  it('risponde 200 con status "up"', async () => {
    const res = await request(buildApp(makeFetch(ALL_UP))).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('up');
    expect(res.body.gateway).toBe('up');
  });

  it('include un timestamp ISO', async () => {
    const res = await request(buildApp(makeFetch(ALL_UP))).get('/health');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('riporta tutti i servizi come "up"', async () => {
    const res = await request(buildApp(makeFetch(ALL_UP))).get('/health');
    const names = Object.keys(SERVICES);
    for (const name of names) {
      expect(res.body.services[name].status).toBe('up');
    }
  });

  it('riporta la latenza per ogni servizio', async () => {
    const res = await request(buildApp(makeFetch(ALL_UP))).get('/health');
    for (const svc of Object.values(res.body.services)) {
      expect(typeof (svc as any).latencyMs).toBe('number');
    }
  });
});

describe('GET /health — alcuni servizi DOWN', () => {
  const partialUp = {
    ...ALL_UP,
    'http://auth:3001/health': 503,
    'http://catalog:3002/health': 500,
  };

  it('risponde 207 con status "degraded"', async () => {
    const res = await request(buildApp(makeFetch(partialUp))).get('/health');
    expect(res.status).toBe(207);
    expect(res.body.status).toBe('degraded');
  });

  it('segna i servizi in errore come "down"', async () => {
    const res = await request(buildApp(makeFetch(partialUp))).get('/health');
    expect(res.body.services.auth.status).toBe('down');
    expect(res.body.services.catalog.status).toBe('down');
    expect(res.body.services.auth.error).toMatch(/503/);
  });

  it('i servizi raggiungibili restano "up"', async () => {
    const res = await request(buildApp(makeFetch(partialUp))).get('/health');
    expect(res.body.services.cart.status).toBe('up');
    expect(res.body.services.reporting.status).toBe('up');
  });
});

describe('GET /health — tutti i servizi DOWN', () => {
  const allDown = Object.fromEntries(ALL_HEALTH_URLS.map(u => [u, 503]));

  it('risponde 503 con status "down"', async () => {
    const res = await request(buildApp(makeFetch(allDown))).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
  });
});

describe('GET /health — timeout di rete', () => {
  it('segna il servizio come "down" con messaggio di errore', async () => {
    const res = await request(buildApp(makeTimeoutFetch())).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
    const svc = res.body.services.auth;
    expect(svc.status).toBe('down');
    expect(typeof svc.error).toBe('string');
  });
});
