/**
 * [INT] cadService — test e2e attraverso il gateway (localhost:3000)
 *
 * Prerequisiti:
 *   docker compose -f docker-compose.dev.yml up --build
 *
 * Flusso testato:
 *   1. Seed componenti catalogo (RIPIANO, PIEDINO, TERMINALE, MONTANTE) per categoria TONDO
 *   2. Crea configurazione CAD
 *   3. Setup categoria → piano colonne → design
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

describe('[INT] CAD — categoria QUADRO con ripiani intelligenti (adiacenza)', () => {
  let quadroConfigId = '';

  // Componenti QUADRO seedati per questo run: sia RIPIANO normale sia le
  // varianti "intelligenti" (RIPIANO_BORDO / RIPIANO_INTERMEDIO), stessa
  // larghezza — così una colonna può passare dinamicamente dall'uno all'altro.
  const ripianoSku    = `INT-QRIP-800-${RUN}`;
  const bordoSku      = `INT-QBORDO-800-${RUN}`;
  const intermezzoSku = `INT-QINT-800-${RUN}`;
  const quadroPiedinSku = `INT-QPIE-120-${RUN}`;
  const quadroMontSku   = `INT-QMON-300-${RUN}`;
  const quadroTermSku   = `INT-QTER-040-${RUN}`;

  beforeAll(async () => {
    await createComponent(adminToken, {
      sku: ripianoSku, name: 'Ripiano QUADRO 800mm',
      description: 'e2e', category: 'QUADRO', Type: 'RIPIANO',
      price: 950, isAvailable: true, imageUrl: '',
      dimensions: { widthMm: 800, heightMm: 18, depthMm: 200 }, compatibleWith: [],
    });
    await createComponent(adminToken, {
      sku: bordoSku, name: 'Ripiano Bordo QUADRO 800mm',
      description: 'e2e', category: 'QUADRO', Type: 'RIPIANO_BORDO',
      price: 1000, isAvailable: true, imageUrl: '',
      dimensions: { widthMm: 800, heightMm: 18, depthMm: 200 }, compatibleWith: [],
    });
    await createComponent(adminToken, {
      sku: intermezzoSku, name: 'Ripiano Intermezzo QUADRO 800mm',
      description: 'e2e', category: 'QUADRO', Type: 'RIPIANO_INTERMEDIO',
      price: 900, isAvailable: true, imageUrl: '',
      dimensions: { widthMm: 800, heightMm: 18, depthMm: 200 }, compatibleWith: [],
    });
    await createComponent(adminToken, {
      sku: quadroPiedinSku, name: 'Piedino QUADRO 120mm',
      description: 'e2e', category: 'QUADRO', Type: 'PIEDINO',
      price: 490, isAvailable: true, imageUrl: '',
      dimensions: { widthMm: 0, heightMm: 120, depthMm: 0 }, compatibleWith: [],
    });
    await createComponent(adminToken, {
      sku: quadroMontSku, name: 'Montante QUADRO 300mm',
      description: 'e2e', category: 'QUADRO', Type: 'MONTANTE',
      price: 1490, isAvailable: true, imageUrl: '',
      dimensions: { widthMm: 0, heightMm: 300, depthMm: 0 }, compatibleWith: [],
    });
    await createComponent(adminToken, {
      sku: quadroTermSku, name: 'Terminale QUADRO 40mm',
      description: 'e2e', category: 'QUADRO', Type: 'TERMINALE',
      price: 390, isAvailable: true, imageUrl: '',
      dimensions: { widthMm: 0, heightMm: 40, depthMm: 0 }, compatibleWith: [],
    });
  }, 30000);

  it('crea configurazione QUADRO con 3 colonne', async () => {
    const created = await fetch(`${BASE}/cad/configurations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: `Scaffale Quadro ${RUN}` }),
    });
    expect(created.status).toBe(201);
    quadroConfigId = ((await json(created))['id'] as string);

    const category = await fetch(`${BASE}/cad/configurations/${quadroConfigId}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ category: 'QUADRO' }),
    });
    expect(category.status).toBe(200);
    expect((await json(category))['category']).toBe('QUADRO');

    const plan = await fetch(`${BASE}/cad/configurations/${quadroConfigId}/column-plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        columnCount: 3,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 800 },
          { index: 2, shelfWidthMm: 800 },
        ],
      }),
    });
    expect(plan.status).toBe(200);
    expect((await json(plan))['status']).toBe('COLUMNS_DEFINED');
  });

  it('ListNextOptions → 200 con opzioni per la prima colonna (nessuna adiacenza ancora)', async () => {
    const res = await fetch(
      `${BASE}/cad/configurations/${quadroConfigId}/next-options?columnIndex=0`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const options = body['options'] as Array<Record<string, unknown>>;
    expect(Array.isArray(options)).toBe(true);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((o) => o['allowed'] === true)).toBe(true);
  });

  it('PATCH /design → 200 con livelli non allineati tra colonne (nessun vincolo globale)', async () => {
    // Livello 120mm condiviso da tutte e 3 le colonne (adiacenti) → BORDO,
    // INTERMEDIO, BORDO. Livello 440mm presente solo sulle colonne 0 e 2, che
    // NON sono adiacenti tra loro (la colonna 1 in mezzo non lo ha) → resta
    // un ripiano RIPIANO normale su entrambe, non un cluster.
    const res = await fetch(`${BASE}/cad/configurations/${quadroConfigId}/design`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        columnDesigns: [
          { columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 },
          { columnIndex: 1, levelsMm: [120],       shelfThicknessMm: 20 },
          { columnIndex: 2, levelsMm: [120, 440], shelfThicknessMm: 20 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect((await json(res))['status']).toBe('READY_FOR_FINALIZE');
  });

  it('POST /finalize → FINALIZED con BOM misto RIPIANO + RIPIANO_BORDO + RIPIANO_INTERMEDIO', async () => {
    const res = await fetch(`${BASE}/cad/configurations/${quadroConfigId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['status']).toBe('FINALIZED');

    const bom = body['bom'] as Array<Record<string, unknown>>;
    expect(Array.isArray(bom)).toBe(true);
    expect(bom.length).toBeGreaterThan(0);

    const types = new Set(bom.map((i) => i['componentType']));
    expect(types.has('RIPIANO')).toBe(true);
    expect(types.has('RIPIANO_BORDO')).toBe(true);
    expect(types.has('RIPIANO_INTERMEDIO')).toBe(true);
    expect(types.has('PIEDINO')).toBe(true);
    expect(types.has('MONTANTE')).toBe(true);
    expect(types.has('TERMINALE')).toBe(true);

    // level 120mm (cluster di 3): colonna 0 e 2 = BORDO, colonna 1 = INTERMEDIO
    const bordoItem = bom.find((i) => i['sku'] === bordoSku);
    expect(bordoItem?.['quantity']).toBe(2);

    const intItem = bom.find((i) => i['sku'] === intermezzoSku);
    expect(intItem?.['quantity']).toBe(1);

    // level 440mm (colonne 0 e 2, non adiacenti tra loro): resta RIPIANO normale
    const ripianoItem = bom.find((i) => i['sku'] === ripianoSku);
    expect(ripianoItem?.['quantity']).toBe(2);
  });

  it('GET /cart → carrello contiene sia i ripiani normali sia quelli intelligenti', async () => {
    const res = await fetch(`${BASE}/cart`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body['items'] as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((i) => i['sku'] === ripianoSku)).toBe(true);
    expect(items.some((i) => i['sku'] === bordoSku)).toBe(true);
    expect(items.some((i) => i['sku'] === intermezzoSku)).toBe(true);
  });
});
