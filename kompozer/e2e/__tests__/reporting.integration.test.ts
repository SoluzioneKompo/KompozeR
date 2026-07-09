/**
 * [INT] reportingService — trend ordini base per admin
 */

export {};

const BASE = 'http://localhost:3000';
const RUN = Date.now();

let adminToken = '';
let userToken = '';
let guestToken = '';
let createdOrderId = '';

const expeditionInfo = {
  name: 'Mario',
  surname: 'Rossi',
  mail: 'mario.rossi@example.com',
  nation: 'Italia',
  city: 'Milano',
  cap: '20100',
  address: 'Via Roma 10',
  phone: '+390212345678',
  deliveryNotes: 'Citofono Rossi',
};

async function timedFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(10000),
  });
}

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

beforeAll(async () => {
  const adminRes = await timedFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'devuser', password: 'devpassword' }),
  });

  if (!adminRes.ok) {
    throw new Error(`[reporting INT] admin login fallito (${adminRes.status})`);
  }
  adminToken = ((await json(adminRes)) as Record<string, string>)['token'];

  const username = `reporting_user_${RUN}`;
  await timedFetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      name: 'Reporting',
      surname: 'User',
      email: `${username}@test.com`,
      password: 'password123',
    }),
  });

  const userRes = await timedFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  if (!userRes.ok) {
    throw new Error(`[reporting INT] user login fallito (${userRes.status})`);
  }
  userToken = ((await json(userRes)) as Record<string, string>)['token'];

  const guestRes = await timedFetch(`${BASE}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!guestRes.ok) {
    throw new Error(`[reporting INT] guest login fallito (${guestRes.status})`);
  }
  guestToken = ((await json(guestRes)) as Record<string, string>)['token'];

  const checkout = await timedFetch(`${BASE}/cart/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
    body: JSON.stringify({ expeditionInfo }),
  });

  if (checkout.status === 200) {
    const body = await json<Record<string, unknown>>(checkout);
    createdOrderId = body['orderId'] as string;
  }
}, 30000);

describe('[INT] Reporting — admin order trend', () => {
  it('GET /reports/trends/orders -> 403 per utente non admin', async () => {
    const res = await timedFetch(`${BASE}/reports/trends/orders`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(403);
    const body = await json<Record<string, unknown>>(res);
    expect((body['error'] as Record<string, unknown>)['code']).toBe('FORBIDDEN');
  });

  it('GET /reports/trends/orders -> 200 per admin con payload trend valido', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const res = await timedFetch(`${BASE}/reports/trends/orders?from=${today}&to=${today}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);

    expect(body['from']).toBe(today);
    expect(body['to']).toBe(today);
    expect(body['days']).toBe(1);

    const totals = body['totals'] as Record<string, unknown>;
    expect(totals['totalOrders']).toEqual(expect.any(Number));
    expect(totals['totalRevenue']).toEqual(expect.any(Number));

    const points = body['points'] as Array<Record<string, unknown>>;
    expect(Array.isArray(points)).toBe(true);
    expect(points).toHaveLength(1);
    expect(points[0]?.['date']).toBe(today);
    expect(points[0]?.['totalOrders']).toEqual(expect.any(Number));

    if (createdOrderId) {
      expect(totals['totalOrders'] as number).toBeGreaterThanOrEqual(1);
    }
  });

  it('GET /reports/trends/orders -> 403 per guest', async () => {
    const res = await timedFetch(`${BASE}/reports/trends/orders`, {
      headers: { Authorization: `Bearer ${guestToken}` },
    });

    expect(res.status).toBe(403);
    const body = await json<Record<string, unknown>>(res);
    expect((body['error'] as Record<string, unknown>)['code']).toBe('FORBIDDEN');
  });
});
