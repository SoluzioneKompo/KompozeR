/**
 * [INT] catalogService — test e2e attraverso il gateway (localhost:3000)
 *
 * Dati persistiti su MongoDB dopo l'esecuzione — visibili in Compass:
 *   Connessione catalog DB: mongodb://root:changeme@localhost:27018/?authSource=admin
 *   Collection:             catalogdb.components
 *
 * Prerequisito: globalSetup ha eseguito il seed (devuser con ruolo ADMIN).
 *
 * Lo SKU e generato dal backend da category/Type/dimensions (non e piu
 * accettato dal client) — vedi domain/services/generateSku.
 * I dati NON vengono puliti: restano visibili in Compass (utile per debuggare).
 */

export {};

const BASE = 'http://localhost:3000';
const SEARCH_TOKEN = `catalog-e2e-${Date.now()}`;

let adminToken = '';
let baseToken  = '';
let componentId = '';
let createdSku = '';
let kubeSku = '';

// ── Setup: login come ADMIN e come utente BASE ────────────────────────────────

beforeAll(async () => {
  // Login admin (devuser — creato/aggiornato dal globalSetup tramite seed)
  const adminLoginRes = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: 'devuser', password: 'devpassword' }),
  });
  if (!adminLoginRes.ok) {
    throw new Error(
      `[catalog INT] Login admin fallito (${adminLoginRes.status}) — il seed è stato eseguito?`,
    );
  }
  adminToken = ((await adminLoginRes.json()) as Record<string, unknown>)['token'] as string;

  // Registra + login utente BASE (per i test di accesso negato)
  const suffix = `b${Date.now()}`;
  await fetch(`${BASE}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      username: `base_${suffix}`,
      name: 'Base',
      surname: 'User',
      email:    `base_${suffix}@test.com`,
      password: 'password123',
    }),
  });
  const baseLoginRes = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: `base_${suffix}`, password: 'password123' }),
  });
  baseToken = ((await baseLoginRes.json()) as Record<string, unknown>)['token'] as string;
});

// ── Accesso protetto ─────────────────────────────────────────────────────────

describe('[INT] Catalog — accesso protetto', () => {
  it('GET /catalog → 401 senza token (gateway blocca prima del servizio)', async () => {
    const res = await fetch(`${BASE}/catalog`);
    expect(res.status).toBe(401);
  });

  it('GET /catalog → 200 con token BASE, risposta paginata valida', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      headers: { Authorization: `Bearer ${baseToken}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('totalPages');
    expect(Array.isArray(body['items'])).toBe(true);
  });
});

// ── CRUD admin ───────────────────────────────────────────────────────────────

describe('[INT] Catalog — CRUD (ruolo ADMIN)', () => {
  it('POST /catalog → 403 con ruolo BASE (catalog-service rifiuta)', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baseToken}` },
      body: JSON.stringify({
        name:           'Non dovrebbe crearsi',
        description:    '',
        category:       'TONDO',
        Type:           'RIPIANO',
        price:          100,
        isAvailable:    true,
        imageUrl:       '',
        dimensions:     { widthMm: 1, heightMm: 1, depthMm: 1 },
        compatibleWith: [],
      }),
    });
    expect(res.status).toBe(403);
    // → nessun documento in Compass
  });

  it('POST /catalog → 201, crea componente TONDO/RIPIANO con SKU generato da category/Type/dimensions (visibile in Compass → catalogdb.components)', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name:           'Ripiano test integrazione',
        description:    `Creato dai test e2e ${SEARCH_TOKEN} — sicuro da eliminare`,
        category:       'TONDO',
        Type:           'RIPIANO',
        price:          2500,           // 25,00 €
        isAvailable:    true,
        imageUrl:       '',
        dimensions:     { widthMm: 800, heightMm: 20, depthMm: 300 },
        compatibleWith: [],
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json() as Record<string, unknown>;
    // Suite non pulisce i dati tra le run: se le stesse specifiche esistono
    // già, il backend aggiunge un suffisso numerico (vedi test successivo).
    expect(body['sku']).toMatch(/^TONDO-SKU-RIPIANO-800x300(-\d+)?$/);
    expect(body['price']).toBe(2500);
    expect(body['version']).toBe(1);      // OCC: parte da 1
    componentId = body['id'] as string;
    createdSku  = body['sku'] as string;
    // → Compass: catalogdb.components — documento con version=1, price=2500
  });

  it('POST /catalog → 201, stesse specifiche → SKU con suffisso numerico', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name:           'Doppione',
        description:    '',
        category:       'TONDO',
        Type:           'RIPIANO',
        price:          1000,
        isAvailable:    true,
        imageUrl:       '',
        dimensions:     { widthMm: 800, heightMm: 20, depthMm: 300 }, // stesse specifiche del test precedente
        compatibleWith: [],
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json() as Record<string, unknown>;
    expect(body['sku']).not.toBe(createdSku);
    expect(body['sku']).toMatch(/^TONDO-SKU-RIPIANO-800x300-\d+$/);
  });

  it('POST /catalog → 422 VALIDATION_ERROR con name vuoto', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name:           '',              // campo obbligatorio vuoto
        description:    '',
        category:       'TONDO',
        Type:           'RIPIANO',
        price:          1000,
        isAvailable:    true,
        imageUrl:       '',
        dimensions:     { widthMm: 1, heightMm: 1, depthMm: 1 },
        compatibleWith: [],
      }),
    });
    expect(res.status).toBe(422);

    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('VALIDATION_ERROR');
  });

  it('POST /catalog → 422 VALIDATION_ERROR se il body include ancora uno sku (campo non piu accettato)', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        sku:            'CLIENT-PROVIDED',
        name:           'Non dovrebbe crearsi',
        description:    '',
        category:       'TONDO',
        Type:           'RIPIANO',
        price:          1000,
        isAvailable:    true,
        imageUrl:       '',
        dimensions:     { widthMm: 1, heightMm: 1, depthMm: 1 },
        compatibleWith: [],
      }),
    });
    expect(res.status).toBe(422);

    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('VALIDATION_ERROR');
  });

  it('POST /catalog → 201, crea componente KUBE/RIPIANO', async () => {
    const res = await fetch(`${BASE}/catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name:           'Ripiano kube test integrazione',
        description:    `Creato dai test e2e ${SEARCH_TOKEN} — categoria kube`,
        category:       'KUBE',
        Type:           'RIPIANO',
        price:          2700,
        isAvailable:    true,
        imageUrl:       '',
        dimensions:     { widthMm: 800, heightMm: 20, depthMm: 300 },
        compatibleWith: [],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['sku']).toMatch(/^KUBE-SKU-RIPIANO-800x300(-\d+)?$/);
    expect(body['category']).toBe('KUBE');
    kubeSku = body['sku'] as string;
  });
});

// ── Lettura e filtri ─────────────────────────────────────────────────────────

describe('[INT] Catalog — lettura e filtri', () => {
  it('GET /catalog/:id → 200, recupera il componente creato', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(componentId);
    expect(body['name']).toBe('Ripiano test integrazione');
    expect(body['version']).toBe(1);
  });

  it('GET /catalog → 200, il componente compare nella lista', async () => {
    const res = await fetch(`${BASE}/catalog?search=${encodeURIComponent(SEARCH_TOKEN)}&limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json() as Record<string, unknown>;
    const items = body['items'] as Array<Record<string, unknown>>;
    const found = items.find(i => i['id'] === componentId);
    expect(found).toBeDefined();
  });

  it('GET /catalog?category=TONDO → 200, solo componenti TONDO', async () => {
    const res = await fetch(`${BASE}/catalog?category=TONDO&search=${encodeURIComponent(SEARCH_TOKEN)}&limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    const items = body['items'] as Array<Record<string, unknown>>;
    expect(items.some(i => i['id'] === componentId)).toBe(true);
    expect(items.every(i => i['category'] === 'TONDO')).toBe(true);
  });

  it('GET /catalog?category=KUBE → 200, solo componenti KUBE', async () => {
    const res = await fetch(`${BASE}/catalog?category=KUBE&search=${encodeURIComponent(SEARCH_TOKEN)}&limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    const items = body['items'] as Array<Record<string, unknown>>;
    expect(items.some(i => i['sku'] === kubeSku)).toBe(true);
    expect(items.every(i => i['category'] === 'KUBE')).toBe(true);
  });

  it('GET /catalog?available=true → 200, contiene il componente (isAvailable=true)', async () => {
    const res = await fetch(`${BASE}/catalog?available=true&search=${encodeURIComponent(SEARCH_TOKEN)}&limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    const items = body['items'] as Array<Record<string, unknown>>;
    expect(items.some(i => i['id'] === componentId)).toBe(true);
  });

  it('GET /catalog/:id → 404 su ID inesistente', async () => {
    const res = await fetch(`${BASE}/catalog/id-che-non-esiste`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);

    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('COMPONENT_NOT_FOUND');
  });
});

// ── Aggiornamento + OCC ──────────────────────────────────────────────────────

describe('[INT] Catalog — aggiornamento e OCC [DS]', () => {
  it('PUT /catalog/:id → 200, aggiorna prezzo e nome — version 1→2 (visibile in Compass)', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        expectedVersion: 1,       // [DS] OCC: versione attesa
        price:           3000,    // nuovo prezzo: 30,00 €
        name:            'Ripiano aggiornato',
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body['price']).toBe(3000);
    expect(body['name']).toBe('Ripiano aggiornato');
    expect(body['version']).toBe(2);  // [DS] versione incrementata
    // → Compass: stesso documento, ora version=2 price=3000
  });

  it('[DS] PUT /catalog/:id → 409 VERSION_CONFLICT con versione stale', async () => {
    // Inviamo expectedVersion=1 ma il documento è già alla versione 2
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ expectedVersion: 1, price: 9999 }),
    });
    expect(res.status).toBe(409);

    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('VERSION_CONFLICT');
    // → Compass: il documento rimane intatto con version=2 (no silent overwrite)
  });

  it('PUT /catalog/:id → 403 con ruolo BASE', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baseToken}` },
      body: JSON.stringify({ expectedVersion: 2, price: 1 }),
    });
    expect(res.status).toBe(403);
  });
});

// ── Eliminazione ─────────────────────────────────────────────────────────────

describe('[INT] Catalog — eliminazione', () => {
  it('DELETE /catalog/:id → 403 con ruolo BASE', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${baseToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('DELETE /catalog/:id → 204, elimina il componente', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(204);
    // → Compass: il documento scompare da catalogdb.components
  });

  it('GET /catalog/:id → 404 dopo eliminazione', async () => {
    const res = await fetch(`${BASE}/catalog/${componentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);

    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('COMPONENT_NOT_FOUND');
  });
});
