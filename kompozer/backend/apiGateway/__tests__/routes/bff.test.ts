/**
 * TDD coverage for gateway BFF aggregation routes.
 * Uses a fake clientFactory to isolate aggregation logic
 * without real network dependencies.
 */
import request from 'supertest';
import express from 'express';
import { buildBffRouter, ClientFactory } from '../../src/routes/bff';
import { HttpClient, IdentityHeaders } from '../../src/adapters/httpClient/ServiceClient';
import { ServiceUrls } from '../../src/routes/index';
import { gatewayErrorMiddleware } from '../../src/middleware/gatewayErrorMiddleware';

const SERVICES: ServiceUrls = {
  auth:         'http://auth:3001',
  catalog:      'http://catalog:3002',
  cad:          'http://cad:3003',
  cart:         'http://cart:3004',
  order:        'http://order:3008',
  payment:      'http://payment:3009',
  notification: 'http://notification:3005',
  reporting:    'http://reporting:3007',
};

// Fake ClientFactory

/** Maps baseUrl -> (path -> response or Error) to simulate per-service behavior. */
type ServiceMocks = Record<string, Record<string, unknown | Error>>;

function makeFakeFactory(mocks: ServiceMocks): ClientFactory {
  return (baseUrl: string, _identity: IdentityHeaders): HttpClient => ({
    async get<T>(path: string): Promise<T> {
      const svcMocks = mocks[baseUrl] ?? {};
      const response = svcMocks[path];
      if (response instanceof Error) throw response;
      if (response !== undefined) return response as T;
      throw new Error(`No mock for ${baseUrl}${path}`);
    },
  });
}

/** ClientFactory variant that also captures incoming identity headers. */
function makeCapturingFactory(
  mocks: ServiceMocks,
  captured: Array<{ baseUrl: string; identity: IdentityHeaders }>,
): ClientFactory {
  return (baseUrl: string, identity: IdentityHeaders): HttpClient => {
    captured.push({ baseUrl, identity });
    return makeFakeFactory(mocks)(baseUrl, identity);
  };
}

function buildApp(factory: ClientFactory) {
  const app = express();
  app.use(buildBffRouter(SERVICES, factory));
  app.use(gatewayErrorMiddleware);
  return app;
}

// GET /bff/dashboard

const DASHBOARD_MOCKS: ServiceMocks = {
  'http://cart:3004':         { '/cart':                      { items: [], total: 0 } },
  'http://cad:3003':          { '/sessions':                  [{ id: 'sess-1' }] },
  'http://notification:3005': { '/notifications/unread/count': { count: 3 } },
};

describe('GET /bff/dashboard — tutti i servizi UP', () => {
  const app = buildApp(makeFakeFactory(DASHBOARD_MOCKS));

  it('risponde 200', async () => {
    const res = await request(app).get('/bff/dashboard');
    expect(res.status).toBe(200);
  });

  it('contiene i dati di cart, cadSessions e notifications', async () => {
    const res = await request(app).get('/bff/dashboard');
    expect(res.body.cart.data).toEqual({ items: [], total: 0 });
    expect(res.body.cadSessions.data).toEqual([{ id: 'sess-1' }]);
    expect(res.body.notifications.data).toEqual({ count: 3 });
  });
});

describe('GET /bff/dashboard — un servizio DOWN', () => {
  const partialMocks: ServiceMocks = {
    ...DASHBOARD_MOCKS,
    'http://cart:3004': { '/cart': new Error('connection refused') },
  };
  const app = buildApp(makeFakeFactory(partialMocks));

  it('risponde comunque 200 (partial data)', async () => {
    const res = await request(app).get('/bff/dashboard');
    expect(res.status).toBe(200);
  });

  it('cart ha campo error, gli altri hanno campo data', async () => {
    const res = await request(app).get('/bff/dashboard');
    expect(res.body.cart.error).toBeDefined();
    expect(res.body.cadSessions.data).toBeDefined();
    expect(res.body.notifications.data).toBeDefined();
  });

  it('il messaggio di errore è la stringa del servizio fallito', async () => {
    const res = await request(app).get('/bff/dashboard');
    expect(res.body.cart.error).toBe('connection refused');
  });
});

describe('GET /bff/dashboard — tutti i servizi DOWN', () => {
  const allDownMocks: ServiceMocks = {
    'http://cart:3004':         { '/cart':                       new Error('down') },
    'http://cad:3003':          { '/sessions':                   new Error('down') },
    'http://notification:3005': { '/notifications/unread/count': new Error('down') },
  };
  const app = buildApp(makeFakeFactory(allDownMocks));

  it('risponde 200 con tutti i campi error', async () => {
    const res = await request(app).get('/bff/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.cart.error).toBeDefined();
    expect(res.body.cadSessions.error).toBeDefined();
    expect(res.body.notifications.error).toBeDefined();
  });
});

describe('GET /bff/dashboard — forward degli identity header', () => {
  it('passa gli header X-User-* al clientFactory', async () => {
    const captured: Array<{ baseUrl: string; identity: IdentityHeaders }> = [];
    const app = buildApp(makeCapturingFactory(DASHBOARD_MOCKS, captured));

    await request(app)
      .get('/bff/dashboard')
      .set('X-User-Id', 'usr-42')
      .set('X-User-Role', 'BASE')
      .set('X-Session-Id', 'tok-99');

    expect(captured.length).toBeGreaterThan(0);
    for (const call of captured) {
      expect(call.identity['x-user-id']).toBe('usr-42');
      expect(call.identity['x-user-role']).toBe('BASE');
      expect(call.identity['x-session-id']).toBe('tok-99');
    }
  });
});

// GET /bff/configurator/:sessionId

const CONFIGURATOR_MOCKS: ServiceMocks = {
  'http://cad:3003':     { '/sessions/sess-abc/snapshot': { operations: [1, 2, 3] } },
  'http://catalog:3002': { '/catalog/items':              [{ id: 'item-1', price: 99 }] },
};

describe('GET /bff/configurator/:sessionId — tutti i servizi UP', () => {
  const app = buildApp(makeFakeFactory(CONFIGURATOR_MOCKS));

  it('risponde 200', async () => {
    const res = await request(app).get('/bff/configurator/sess-abc');
    expect(res.status).toBe(200);
  });

  it('contiene snapshot e catalogItems', async () => {
    const res = await request(app).get('/bff/configurator/sess-abc');
    expect(res.body.snapshot.data).toEqual({ operations: [1, 2, 3] });
    expect(res.body.catalogItems.data).toEqual([{ id: 'item-1', price: 99 }]);
  });
});

describe('GET /bff/configurator/:sessionId — sessionId con formato non valido', () => {
  it('422 invece di inoltrare il valore grezzo al servizio a valle', async () => {
    const app = buildApp(makeFakeFactory(CONFIGURATOR_MOCKS));

    const res = await request(app).get('/bff/configurator/..%2F..%2Fsecret');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /bff/configurator/:sessionId — cad-service DOWN', () => {
  const partialMocks: ServiceMocks = {
    'http://cad:3003':     { '/sessions/sess-abc/snapshot': new Error('cad unavailable') },
    'http://catalog:3002': { '/catalog/items':              [{ id: 'item-1', price: 99 }] },
  };
  const app = buildApp(makeFakeFactory(partialMocks));

  it('risponde 200 con snapshot.error e catalogItems.data', async () => {
    const res = await request(app).get('/bff/configurator/sess-abc');
    expect(res.status).toBe(200);
    expect(res.body.snapshot.error).toBe('cad unavailable');
    expect(res.body.catalogItems.data).toBeDefined();
  });
});
