/**
 * [INT] cadService — test e2e attraverso il gateway (localhost:3000)
 *
 * Prerequisiti:
 *   docker compose -f docker-compose.dev.yml up --build
 *
 * Flusso testato:
 *   1. Seed componenti catalogo (RIPIANO, PIEDINO, TERMINALE, MONTANTE) per categoria TONDO
 *   2. Crea configurazione CAD
 *   3. Setup ambiente → categoria → piano colonne → design
 *   4. Finalizza → verifica BOM nel response + carrello aggiornato
 *
 * Dati persistiti (visibili in Compass):
 *   CAD DB:     mongodb://root:changeme@localhost:27020/?authSource=admin  →  caddb.configurations
 *   Catalog DB: mongodb://root:changeme@localhost:27018/?authSource=admin  →  catalogdb.components
 *   Cart DB:    mongodb://root:changeme@localhost:27019/?authSource=admin  →  cartdb.carts
 */

export {};

const BASE = 'http://localhost:3000';
const RUN  = Date.now(); // univoco per ogni run — evita conflitti su SKU

let adminToken = '';
let userToken  = '';
let otherUserToken = '';
let configurationId = '';

// Componenti seedati per questo run
const ripiano800Sku  = `INT-RIP-800-${RUN}`;
const piedino120Sku  = `INT-PIE-120-${RUN}`;
const terminale40Sku = `INT-TER-040-${RUN}`;
const montante300Sku = `INT-MON-300-${RUN}`;
const montante120Sku = `INT-MON-120-${RUN}`;

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

async function createComponent(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seed component failed (${res.status}): ${text}`);
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Login admin
  const adminRes = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: 'devuser', password: 'devpassword' }),
  });
  if (!adminRes.ok) {
    throw new Error(`[cad INT] Admin login failed (${adminRes.status})`);
  }
  adminToken = ((await json(adminRes)) as Record<string, string>)['token'];

  // 2. Registra e loggina utente normale
  const suffix = `cadu${RUN}`;
  await fetch(`${BASE}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      username: suffix,
      name: 'Cad',
      surname: 'User',
      email: `${suffix}@test.com`,
      password: 'password123',
    }),
  });
  const userRes = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: suffix, password: 'password123' }),
  });
  userToken = ((await json(userRes)) as Record<string, string>)['token'];

  const otherSuffix = `cadu_other_${RUN}`;
  await fetch(`${BASE}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      username: otherSuffix,
      name: 'Cad',
      surname: 'Other',
      email: `${otherSuffix}@test.com`,
      password: 'password123',
    }),
  });
  const otherUserRes = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: otherSuffix, password: 'password123' }),
  });
  if (!otherUserRes.ok) {
    throw new Error(`[cad INT] other user login failed (${otherUserRes.status})`);
  }
  otherUserToken = ((await json(otherUserRes)) as Record<string, string>)['token'];

  // 3. Seed componenti TONDO nel catalogo (idempotente per SKU univoco per run)
  await createComponent(adminToken, {
    sku: ripiano800Sku, name: 'Ripiano TONDO 800mm (INT)',
    description: 'Integration test', category: 'TONDO', Type: 'RIPIANO',
    price: 3490, isAvailable: true, imageUrl: '',
    dimensions: { widthMm: 800, heightMm: 20, depthMm: 300 }, compatibleWith: [],
  });
  await createComponent(adminToken, {
    sku: piedino120Sku, name: 'Piedino TONDO 120mm (INT)',
    description: 'Integration test', category: 'TONDO', Type: 'PIEDINO',
    price: 490, isAvailable: true, imageUrl: '',
    dimensions: { widthMm: 40, heightMm: 120, depthMm: 40 }, compatibleWith: [],
  });
  await createComponent(adminToken, {
    sku: terminale40Sku, name: 'Terminale TONDO 40mm (INT)',
    description: 'Integration test', category: 'TONDO', Type: 'TERMINALE',
    price: 390, isAvailable: true, imageUrl: '',
    dimensions: { widthMm: 40, heightMm: 40, depthMm: 40 }, compatibleWith: [],
  });
  await createComponent(adminToken, {
    sku: montante300Sku, name: 'Montante TONDO 300mm (INT)',
    description: 'Integration test', category: 'TONDO', Type: 'MONTANTE',
    price: 1490, isAvailable: true, imageUrl: '',
    dimensions: { widthMm: 40, heightMm: 300, depthMm: 40 }, compatibleWith: [],
  });
  await createComponent(adminToken, {
    sku: montante120Sku, name: 'Montante TONDO 120mm (INT)',
    description: 'Integration test', category: 'TONDO', Type: 'MONTANTE',
    price: 990, isAvailable: true, imageUrl: '',
    dimensions: { widthMm: 40, heightMm: 120, depthMm: 40 }, compatibleWith: [],
  });
}, 30000);

// ── Test: flusso completo CAD ─────────────────────────────────────────────────

describe('[INT] CAD — flusso configurazione completo', () => {
  it('POST /cad/configurations → 201, crea bozza', async () => {
    const res = await fetch(`${BASE}/cad/configurations`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body:    JSON.stringify({ name: `Scaffale INT ${RUN}` }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body['status']).toBe('DRAFT');
    configurationId = body['id'] as string;
    expect(configurationId).toBeTruthy();
  });

  it('PATCH /cad/configurations/:id/environment → 200, definisce ambiente', async () => {
    const res = await fetch(`${BASE}/cad/configurations/${configurationId}/environment`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body:    JSON.stringify({ maxWidthMm: 5000, maxHeightMm: 3000, minWidthMm: 600, minHeightMm: 220, unit: 'mm' }),
    });

    expect(res.status).toBe(200);
    expect((await json(res))['status']).toBe('ENVIRONMENT_DEFINED');
  });

  it('PATCH /cad/configurations/:id/category → 200, seleziona categoria TONDO', async () => {
    const res = await fetch(`${BASE}/cad/configurations/${configurationId}/category`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body:    JSON.stringify({ category: 'TONDO' }),
    });

    expect(res.status).toBe(200);
    expect((await json(res))['status']).toBe('CATEGORY_SELECTED');
  });

  it('PATCH /cad/configurations/:id/column-plan → 200, imposta piano colonne', async () => {
    const res = await fetch(`${BASE}/cad/configurations/${configurationId}/column-plan`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body:    JSON.stringify({
        columnCount: 1,
        columns: [{ index: 0, shelfWidthMm: 800 }],
      }),
    });

    expect(res.status).toBe(200);
    expect((await json(res))['status']).toBe('COLUMNS_DEFINED');
  });

  it('PATCH /cad/configurations/:id/design → 200, posiziona ripiani', async () => {
    // levelsMm[0]=120 → gap=120 (piedino); montante 120mm è in catalogo
    // totalHeight = 120 + 20 (shelf) + 40 (terminal) = 180 ≤ 3000 ✓
    const res = await fetch(`${BASE}/cad/configurations/${configurationId}/design`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body:    JSON.stringify({
        columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
      }),
    });

    expect(res.status).toBe(200);
    expect(['DESIGN_IN_PROGRESS', 'READY_FOR_FINALIZE']).toContain((await json(res))['status']);
  });

  it('POST /cad/configurations/:id/finalize → 200, finalizza + BOM nel response', async () => {
    const res = await fetch(`${BASE}/cad/configurations/${configurationId}/finalize`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['status']).toBe('FINALIZED');

    // BOM deve essere presente e contenere tutti e 4 i tipi
    const bom = body['bom'] as Array<Record<string, unknown>>;
    expect(Array.isArray(bom)).toBe(true);
    expect(bom.length).toBeGreaterThan(0);

    const types = new Set(bom.map((i) => i['componentType']));
    expect(types.has('RIPIANO')).toBe(true);
    expect(types.has('PIEDINO')).toBe(true);
    expect(types.has('TERMINALE')).toBe(true);
    expect(types.has('MONTANTE')).toBe(true);
  });

  it('GET /cart → 200, carrello contiene i componenti BOM', async () => {
    const res = await fetch(`${BASE}/cart`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body['items'] as Array<Record<string, unknown>>;

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    // Il ripiano da 800mm deve essere nel carrello
    expect(items.some((i) => i['sku'] === ripiano800Sku)).toBe(true);

    // Totale deve essere > 0
    expect(body['total']).toBeGreaterThan(0);
  });

  it('GET /cad/configurations/:id → 200, status FINALIZED persistito in Mongo', async () => {
    const res = await fetch(`${BASE}/cad/configurations/${configurationId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['status']).toBe('FINALIZED');
    expect(body['category']).toBe('TONDO');
    expect((body['columnPlan'] as Record<string, unknown>)['columnCount']).toBe(1);
  });
});

// ── Test: guardie di accesso ──────────────────────────────────────────────────

describe('[INT] CAD — guardie di accesso', () => {
  it('POST /cad/configurations → 401 senza token', async () => {
    const res = await fetch(`${BASE}/cad/configurations`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: 'No auth' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /cad/configurations/:id → 404 per ID inesistente', async () => {
    const res = await fetch(`${BASE}/cad/configurations/non-existent-id-xyz`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(404);
  });

  it('GET /cad/configurations/:id di altro utente -> 403/404 (ownership isolation)', async () => {
    expect(configurationId).toBeTruthy();

    const res = await fetch(`${BASE}/cad/configurations/${configurationId}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });

    expect([403, 404]).toContain(res.status);
  });
});

describe('[INT] CAD — categoria INTELLIGENTE (Step4 non implementato)', () => {
  let smartConfigurationId = '';

  it('crea una configurazione con categoria INTELLIGENTE', async () => {
    const created = await fetch(`${BASE}/cad/configurations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: `Scaffale Smart INT ${RUN}` }),
    });
    expect(created.status).toBe(201);
    smartConfigurationId = ((await json(created))['id'] as string);

    const env = await fetch(`${BASE}/cad/configurations/${smartConfigurationId}/environment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ maxWidthMm: 5000, maxHeightMm: 3000, minWidthMm: 600, minHeightMm: 220, unit: 'mm' }),
    });
    expect(env.status).toBe(200);

    const category = await fetch(`${BASE}/cad/configurations/${smartConfigurationId}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ category: 'INTELLIGENTE' }),
    });
    expect(category.status).toBe(200);
    expect((await json(category))['category']).toBe('INTELLIGENTE');
  });

  it('ListNextOptions ritorna CATEGORY_LOGIC_NOT_IMPLEMENTED per INTELLIGENTE', async () => {
    const plan = await fetch(`${BASE}/cad/configurations/${smartConfigurationId}/column-plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        columnCount: 1,
        columns: [{ index: 0, shelfWidthMm: 800 }],
      }),
    });
    expect(plan.status).toBe(200);

    const nextOptions = await fetch(`${BASE}/cad/configurations/${smartConfigurationId}/next-options?columnIndex=0`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(nextOptions.status).toBe(501);
    const body = await json(nextOptions);
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('CATEGORY_LOGIC_NOT_IMPLEMENTED');
  });
});
