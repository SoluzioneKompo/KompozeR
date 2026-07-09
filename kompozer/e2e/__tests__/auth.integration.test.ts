/**
 * [INT] authenticationService — test e2e attraverso il gateway (localhost:3000)
 *
 * Dati persistiti su MongoDB dopo l'esecuzione — visibili in Compass:
 *   Connessione auth DB:  mongodb://root:changeme@localhost:27017/?authSource=admin
 *   Collection utenti:   authdb.users
 *   Collection sessioni: authdb.sessions
 *
 * Ogni run crea un utente con username unico (timestamp) per evitare conflitti.
 * I dati NON vengono puliti al termine: restano visibili in Compass per ispezione.
 */

export {};

const BASE   = 'http://localhost:3000';
const SUFFIX = Date.now();

const testUser = {
  username: `tester_${SUFFIX}`,
  name: `Name_${SUFFIX}`,
  surname: `Surname_${SUFFIX}`,
  email:    `tester_${SUFFIX}@test.com`,
  password: 'password123',
};

let token = '';

// ── Registrazione ────────────────────────────────────────────────────────────

describe('[INT] Auth — registrazione', () => {
  it('POST /auth/register → 201, crea utente con ruolo BASE', async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    expect(res.status).toBe(201);

    const body = await res.json() as Record<string, unknown>;
    const user = body['user'] as Record<string, unknown>;
    expect(user['username']).toBe(testUser.username);
    expect(user['name']).toBe(testUser.name);
    expect(user['surname']).toBe(testUser.surname);
    expect(user['role']).toBe('BASE');
    // → Compass: authdb.users — documento appena creato con role=BASE, isActive=true
  });

  it('POST /auth/register → 409 DUPLICATE_USERNAME su stesso username', async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    expect(res.status).toBe(409);

    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('DUPLICATE_USERNAME');
  });

  it('POST /auth/register → 422 VALIDATION_ERROR con password troppo corta', async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...testUser, username: `x_${SUFFIX}`, password: 'short' }),
    });
    expect(res.status).toBe(422);
  });
});

// ── Login ────────────────────────────────────────────────────────────────────

describe('[INT] Auth — login', () => {
  it('POST /auth/login → 200, restituisce JWT firmato', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser.username, password: testUser.password }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['token']).toBe('string');
    expect((body['token'] as string).split('.').length).toBe(3); // header.payload.signature
    token = body['token'] as string;
    // → Compass: authdb.sessions — sessione con isActive=true, expiresAt nel futuro
  });

  it('POST /auth/login → 401 con password errata', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser.username, password: 'sbagliata' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login → 401 con username inesistente', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'inesistente_xyz', password: 'qualsiasi' }),
    });
    expect(res.status).toBe(401);
  });
});

// ── Sessione attiva ──────────────────────────────────────────────────────────

describe('[INT] Auth — sessione attiva', () => {
  it('GET /auth/me → 200, restituisce profilo utente', async () => {
    const res = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body['username']).toBe(testUser.username);
    expect(body['name']).toBe(testUser.name);
    expect(body['surname']).toBe(testUser.surname);
    expect(body['role']).toBe('BASE');
  });

  it('GET /auth/me → 401 senza Authorization header', async () => {
    const res = await fetch(`${BASE}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('GET /auth/sessions → 200, lista sessioni (almeno 1 attiva)', async () => {
    const res = await fetch(`${BASE}/auth/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const payload = await res.json() as Record<string, unknown>;
    const sessions = payload['sessions'] as unknown[];
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    // → Compass: authdb.sessions — le stesse sessioni, filtrate per userId
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────

describe('[INT] Auth — logout', () => {
  it('POST /auth/logout → 204, invalida la sessione corrente', async () => {
    const res = await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);
    // → Compass: authdb.sessions — la sessione risulta non più attiva
  });

  it('GET /auth/me → 401 dopo logout (token non più valido)', async () => {
    const res = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});
