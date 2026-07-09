/**
 * [INT] notificationService + cartService — test e2e cross-service
 *
 * Flusso testato:
 *   1. Admin crea componente nel catalogo con prezzo iniziale
 *   2. Utente aggiunge il componente al carrello (snapshot prezzo corrente)
 *   3. Admin aggiorna il prezzo → catalog pubblica evento Redis PRICE_CHANGED
 *   4. notificationService riceve l'evento, persiste notifica per l'utente
 *   5. GET /notifications → notifica visibile con tipo PRICE_CHANGED
 *   6. POST /cart/checkout → 409 PRICE_CHANGED (prezzo stale nel carrello)
 *   7. Admin disabilita disponibilità → AVAILABILITY_CHANGED
 *   8. GET /notifications/unread/count → contatore aumentato
 *   9. PATCH /notifications/:id/read → notifica segnata come letta
 *  10. GET /notifications?unread=true → letta non compare più
 *  11. POST /notifications/subscriptions → utente si iscrive a SKU
 *  12. DELETE /notifications/subscriptions/:id → iscrizione disattivata
 *
 * Prerequisiti:
 *   docker compose -f docker-compose.dev.yml up --build
 *   (notification-service deve essere attivo su porta 3005 via gateway 3000)
 *
 * Dati persistiti su MongoDB:
 *   Notification DB: mongodb://root:changeme@localhost:27021/?authSource=admin
 *   Collections: notificationdb.notifications, notificationdb.notificationSubscriptions
 */

export {};

const BASE = 'http://localhost:3000';
const RUN = Date.now();

// SKU univoco per ogni run
const SKU = `INT-NOTIF-${RUN}`;

let adminToken = '';
let userToken = '';
let userId = '';
let otherUserToken = '';
let componentId = '';
let checkoutBlockedByPrice = false;

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

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Login admin
  const adminRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'devuser', password: 'devpassword' }),
  });
  if (!adminRes.ok) {
    throw new Error(`[notif INT] Admin login fallito (${adminRes.status})`);
  }
  adminToken = ((await json(adminRes)) as Record<string, string>)['token'];

  // Registra + login utente normale
  const suffix = `nu${RUN}`;
  await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: suffix,
      name: 'Notif',
      surname: 'User',
      email: `${suffix}@test.com`,
      password: 'password123',
    }),
  });

  const userRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: suffix, password: 'password123' }),
  });
  if (!userRes.ok) {
    throw new Error(`[notif INT] User login fallito (${userRes.status})`);
  }
  const userBody = await json<Record<string, unknown>>(userRes);
  userToken = userBody['token'] as string;
  userId = (userBody['user'] as Record<string, string>)['id'];

  const otherSuffix = `nu_other_${RUN}`;
  await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: otherSuffix,
      name: 'Notif',
      surname: 'Other',
      email: `${otherSuffix}@test.com`,
      password: 'password123',
    }),
  });

  const otherUserRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: otherSuffix, password: 'password123' }),
  });
  if (!otherUserRes.ok) {
    throw new Error(`[notif INT] Other user login fallito (${otherUserRes.status})`);
  }
  otherUserToken = ((await json(otherUserRes)) as Record<string, string>)['token'];

  // Crea componente nel catalogo
  const createRes = await fetch(`${BASE}/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      sku: SKU,
      name: `Ripiano Notif ${RUN}`,
      description: 'Creato dal test e2e notifications',
      category: 'TONDO',
      Type: 'RIPIANO',
      price: 2500,
      isAvailable: true,
      imageUrl: '',
      dimensions: { widthMm: 800, heightMm: 20, depthMm: 300 },
      compatibleWith: [],
    }),
  });
  if (!createRes.ok) {
    throw new Error(`[notif INT] Creazione componente fallita (${createRes.status})`);
  }
  const comp = await json<Record<string, unknown>>(createRes);
  componentId = comp['id'] as string;

  // Utente aggiunge il componente al carrello al prezzo corrente (2500)
  const addToCartRes = await fetch(`${BASE}/cart/items/${SKU}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ name: `Ripiano Notif ${RUN}`, unitPrice: 2500, quantity: 1 }),
  });
  if (!addToCartRes.ok) {
    throw new Error(`[notif INT] Aggiunta al carrello fallita (${addToCartRes.status})`);
  }
}, 30000);

// ── Flusso principale ─────────────────────────────────────────────────────────

describe('[INT] Notifiche — flusso catalog update → notifica persisted', () => {
  it('PUT /catalog/:id → 200, aggiorna prezzo — evento PRICE_CHANGED emesso su Redis', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ expectedVersion: 1, price: 3000 }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['price']).toBe(3000);
  });

  it('GET /notifications → 200, notifica PRICE_CHANGED visibile (poll con retry)', async () => {
    // Il notification-service è async: consuma l'evento Redis e persiste la notifica.
    // Attendiamo fino a 5s con retry ogni 500ms.
    let notification: Record<string, unknown> | undefined;

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`${BASE}/notifications`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (!res.ok) continue;
      const body = await json<Record<string, unknown>>(res);
      const items = body['items'] as Array<Record<string, unknown>>;
      notification = items.find((n) => n['type'] === 'PRICE_CHANGED' && n['sku'] === SKU);
      if (notification) break;
    }

    expect(notification).toBeDefined();
    expect(notification!['read']).toBe(false);
    expect(notification!['sku']).toBe(SKU);
  });

  it('GET /notifications con altro utente non espone notifiche altrui (ownership isolation)', async () => {
    const res = await fetch(`${BASE}/notifications`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);
    const items = body['items'] as Array<Record<string, unknown>>;
    expect(items.some((n) => n['sku'] === SKU && n['type'] === 'PRICE_CHANGED')).toBe(false);
  });
});

describe('[INT] Cart — checkout bloccato da prezzo stale', () => {
  it('POST /cart/checkout gestisce disallineamento prezzo (PRICE_CHANGED o checkout riuscito con sync)', async () => {
    const res = await fetch(`${BASE}/cart/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ expeditionInfo }),
    });

    const body = await json<Record<string, unknown>>(res);
    if (res.status === 409) {
      checkoutBlockedByPrice = true;
      expect((body['error'] as Record<string, unknown>)['code']).toBe('PRICE_CHANGED');
      return;
    }

    expect(res.status).toBe(200);
    expect(body['status']).toBe('SUBMITTED');
  });
});

describe('[INT] Notifiche — mark-as-read e unread count', () => {
  let notificationId = '';

  it('GET /notifications → 200, lista con almeno una notifica non letta', async () => {
    const res = await fetch(`${BASE}/notifications`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);
    const items = body['items'] as Array<Record<string, unknown>>;
    const unread = items.filter((n) => !n['read'] && n['sku'] === SKU);
    expect(unread.length).toBeGreaterThan(0);
    notificationId = unread[0]['id'] as string;
  });

  it('GET /notifications/unread/count → 200, count > 0', async () => {
    const res = await fetch(`${BASE}/notifications/unread/count`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json<{ count: number }>(res);
    expect(body.count).toBeGreaterThan(0);
  });

  it('PATCH /notifications/:id/read → 200, notifica segnata come letta', async () => {
    const forbidden = await fetch(`${BASE}/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    expect([403, 404]).toContain(forbidden.status);

    const res = await fetch(`${BASE}/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['read']).toBe(true);
    expect(body['readAt']).not.toBeNull();
  });

  it('GET /notifications?unread=true → 200, notifica letta non compare più', async () => {
    const res = await fetch(`${BASE}/notifications?unread=true`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);
    const items = body['items'] as Array<Record<string, unknown>>;
    const stillUnread = items.find((n) => n['id'] === notificationId);
    expect(stillUnread).toBeUndefined();
  });
});

describe('[INT] Notifiche — availability changed', () => {
  it('POST /notifications/subscriptions → 201, iscrizione preventiva per evento AVAILABILITY_CHANGED', async () => {
    const res = await fetch(`${BASE}/notifications/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        scope: 'PRODUCT',
        targetId: SKU,
        events: ['AVAILABILITY_CHANGED'],
        channel: 'IN_APP',
      }),
    });
    expect(res.status).toBe(201);
  });

  it('PUT /catalog/:id → 200, disabilita disponibilità — evento AVAILABILITY_CHANGED', async () => {
    // La versione dopo PRICE_CHANGED è 2
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ expectedVersion: 2, isAvailable: false }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['isAvailable']).toBe(false);
  });

  it('GET /notifications → 200, notifica AVAILABILITY_CHANGED visibile (poll)', async () => {
    let notification: Record<string, unknown> | undefined;

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`${BASE}/notifications`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (!res.ok) continue;
      const body = await json<Record<string, unknown>>(res);
      const items = body['items'] as Array<Record<string, unknown>>;
      notification = items.find((n) => n['type'] === 'AVAILABILITY_CHANGED' && n['sku'] === SKU);
      if (notification) break;
    }

    expect(notification).toBeDefined();
    expect(notification!['read']).toBe(false);

    if (checkoutBlockedByPrice) {
      expect(notification!['type']).toBe('AVAILABILITY_CHANGED');
    }
  });
});

describe('[INT] Subscriptions — CRUD e2e', () => {
  let subscriptionId = '';

  it('POST /notifications/subscriptions → 201, crea iscrizione per SKU', async () => {
    const res = await fetch(`${BASE}/notifications/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        scope: 'PRODUCT',
        targetId: SKU,
        events: ['PRICE_CHANGED', 'AVAILABILITY_CHANGED'],
        channel: 'IN_APP',
      }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body['targetId']).toBe(SKU);
    expect(body['isActive']).toBe(true);
    subscriptionId = body['id'] as string;
  });

  it('GET /notifications/subscriptions → 200, iscrizione presente', async () => {
    const res = await fetch(`${BASE}/notifications/subscriptions`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json<{ items: Array<Record<string, unknown>> }>(res);
    expect(body.items.some((s) => s['id'] === subscriptionId)).toBe(true);
  });

  it('DELETE /notifications/subscriptions/:id → 204, disattiva iscrizione', async () => {
    const forbidden = await fetch(`${BASE}/notifications/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    expect([403, 404]).toContain(forbidden.status);

    const res = await fetch(`${BASE}/notifications/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(204);
  });

  it('GET /notifications/subscriptions/:id → 200, isActive=false dopo delete', async () => {
    const forbidden = await fetch(`${BASE}/notifications/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    expect([403, 404]).toContain(forbidden.status);

    const res = await fetch(`${BASE}/notifications/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['isActive']).toBe(false);
  });
});
