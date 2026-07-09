/**
 * [INT] orderService + cartService — checkout genera ordine persistito
 */

export {};

const BASE = 'http://localhost:3000';
const RUN = Date.now();
const SKU = `INT-ORDER-${RUN}`;

let adminToken = '';
let userToken = '';
let otherUserToken = '';
let createdOrderId = '';
let createdOrderToCancelId = '';

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

async function parseJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

beforeAll(async () => {
  const adminRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'devuser', password: 'devpassword' }),
  });
  if (!adminRes.ok) {
    throw new Error(`[order INT] admin login fallito (${adminRes.status})`);
  }
  adminToken = ((await parseJson(adminRes)) as Record<string, string>)['token'];

  const username = `order_user_${RUN}`;
  await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      name: 'Order',
      surname: 'User',
      email: `${username}@test.com`,
      password: 'password123',
    }),
  });

  const userRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  if (!userRes.ok) {
    throw new Error(`[order INT] user login fallito (${userRes.status})`);
  }
  userToken = ((await parseJson(userRes)) as Record<string, string>)['token'];

  const otherUsername = `order_other_user_${RUN}`;
  await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: otherUsername,
      name: 'Order',
      surname: 'Other',
      email: `${otherUsername}@test.com`,
      password: 'password123',
    }),
  });

  const otherUserRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: otherUsername, password: 'password123' }),
  });
  if (!otherUserRes.ok) {
    throw new Error(`[order INT] other user login fallito (${otherUserRes.status})`);
  }
  otherUserToken = ((await parseJson(otherUserRes)) as Record<string, string>)['token'];

  const createComponent = await fetch(`${BASE}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      sku: SKU,
      name: `Ripiano Ordine ${RUN}`,
      description: 'Creato dal test e2e ordine',
      category: 'TONDO',
      Type: 'RIPIANO',
      price: 2990,
      isAvailable: true,
      imageUrl: '',
      dimensions: { widthMm: 700, heightMm: 20, depthMm: 300 },
      compatibleWith: [],
    }),
  });
  if (!createComponent.ok) {
    throw new Error(`[order INT] creazione componente fallita (${createComponent.status})`);
  }
}, 30000);

describe('[INT] Order — checkout from cart', () => {
  it('POST /cart/checkout genera ordine e GET /orders lo restituisce', async () => {
    const addToCart = await fetch(`${BASE}/cart/items/${SKU}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ name: `Ripiano Ordine ${RUN}`, unitPrice: 2990, quantity: 2 }),
    });

    expect(addToCart.status).toBe(200);

    const checkout = await fetch(`${BASE}/cart/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ expeditionInfo }),
    });

    expect(checkout.status).toBe(200);
    const checkoutBody = await parseJson<Record<string, unknown>>(checkout);
    expect(checkoutBody['status']).toBe('SUBMITTED');
    expect(checkoutBody['orderId']).toEqual(expect.any(String));

    const orderId = checkoutBody['orderId'] as string;
    createdOrderId = orderId;

    const getOrder = await fetch(`${BASE}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(getOrder.status).toBe(200);
    const orderBody = await parseJson<Record<string, unknown>>(getOrder);
    expect(orderBody['id']).toBe(orderId);
    expect(orderBody['status']).toBe('SUBMITTED');
    expect(orderBody['total']).toBe(5980);

    const listOrders = await fetch(`${BASE}/orders`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(listOrders.status).toBe(200);
    const listBody = await parseJson<Record<string, unknown>>(listOrders);
    const items = listBody['items'] as Array<Record<string, unknown>>;
    expect(items.some((order) => order['id'] === orderId)).toBe(true);
  });

  it('PATCH /orders/:id/status come admin porta ordine a DONE', async () => {
    expect(createdOrderId).toBeTruthy();

    const markDone = await fetch(`${BASE}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'DONE' }),
    });

    expect(markDone.status).toBe(200);
    const doneBody = await parseJson<Record<string, unknown>>(markDone);
    expect(doneBody['status']).toBe('DONE');
    expect(doneBody['doneAt']).toEqual(expect.any(String));
  });

  it('PATCH /orders/:id/cancel come admin porta ordine a CANCELLED anche se di un altro utente', async () => {
    const addToCart = await fetch(`${BASE}/cart/items/${SKU}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ name: `Ripiano Ordine ${RUN}`, unitPrice: 2990, quantity: 1 }),
    });

    expect(addToCart.status).toBe(200);

    const checkout = await fetch(`${BASE}/cart/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ expeditionInfo }),
    });

    expect(checkout.status).toBe(200);
    const checkoutBody = await parseJson<Record<string, unknown>>(checkout);
    createdOrderToCancelId = checkoutBody['orderId'] as string;
    expect(createdOrderToCancelId).toEqual(expect.any(String));

    const cancelOrder = await fetch(`${BASE}/orders/${createdOrderToCancelId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({}),
    });

    expect(cancelOrder.status).toBe(200);
    const cancelledBody = await parseJson<Record<string, unknown>>(cancelOrder);
    expect(cancelledBody['status']).toBe('CANCELLED');
    expect(cancelledBody['cancelledAt']).toEqual(expect.any(String));
  });

  it('GET /orders/:id come utente mostra stato DONE', async () => {
    const getOrder = await fetch(`${BASE}/orders/${createdOrderId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(getOrder.status).toBe(200);
    const orderBody = await parseJson<Record<string, unknown>>(getOrder);
    expect(orderBody['id']).toBe(createdOrderId);
    expect(orderBody['status']).toBe('DONE');
  });

  it('GET /orders/:id come utente mostra stato CANCELLED dopo azione admin', async () => {
    expect(createdOrderToCancelId).toBeTruthy();

    const getOrder = await fetch(`${BASE}/orders/${createdOrderToCancelId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(getOrder.status).toBe(200);
    const orderBody = await parseJson<Record<string, unknown>>(getOrder);
    expect(orderBody['id']).toBe(createdOrderToCancelId);
    expect(orderBody['status']).toBe('CANCELLED');
  });

  it('GET /orders/:id di altro utente -> 403/404 (ownership isolation)', async () => {
    expect(createdOrderId).toBeTruthy();

    const getOrder = await fetch(`${BASE}/orders/${createdOrderId}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });

    expect([403, 404]).toContain(getOrder.status);
  });
});
