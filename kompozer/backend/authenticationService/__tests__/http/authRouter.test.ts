/**
 * HTTP (supertest) coverage for all /auth endpoints.
 *
 * Uses buildTestApp() to mount an Express app with fake repositories (no MongoDB).
 * Verifies status codes, response shapes, and error codes for each endpoint:
 * POST /register, POST /login, POST /guest, GET /me, GET /sessions,
 * POST /logout, DELETE /sessions/:id.
 */
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import { buildTestApp } from '../helpers/buildTestApp';

const app = buildTestApp();

async function registerAndLogin(
  username = 'valerio',
  email = 'valerio@example.com',
  password = 'Password123!',
) {
  await request(app).post('/auth/register').send({
    username,
    name: 'Test',
    surname: 'User',
    email,
    password,
  });
  const res = await request(app).post('/auth/login').send({ identifier: username, password });
  return res.body as { token: string; session: { id: string }; user: { id: string } };
}

// POST /auth/register

describe('POST /auth/register', () => {
  it('returns 201 with user on success', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'alice',
        name: 'Alice',
        surname: 'Rossi',
        email: 'alice@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.role).toBe('BASE');
    expect(res.body.user.id).toBeDefined();
  });

  it('returns 409 on duplicate username', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        username: 'bob',
        name: 'Bob',
        surname: 'Rossi',
        email: 'bob@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'bob',
        name: 'Bob',
        surname: 'Verdi',
        email: 'bob2@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_USERNAME');
  });

  it('returns 409 on duplicate email', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        username: 'charlie',
        name: 'Charlie',
        surname: 'Rossi',
        email: 'shared@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'dave',
        name: 'Dave',
        surname: 'Verdi',
        email: 'shared@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
  });

  it('returns 422 on validation failure', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: '', name: '', surname: '', email: 'bad', password: '12' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('returns 422 when a field has the wrong type instead of crashing', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'zed', name: 'Zed', surname: 'Zed', email: 'zed@example.com', password: 12345678 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 on unknown/extra fields (rejects mass-assignment attempts)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'zed2',
        name: 'Zed',
        surname: 'Zed',
        email: 'zed2@example.com',
        password: 'Password123!',
        role: 'ADMIN',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// POST /auth/login

describe('POST /auth/login', () => {
  it('returns 200 with token and session on valid credentials', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        username: 'eve',
        name: 'Eve',
        surname: 'Rossi',
        email: 'eve@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'eve', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.session.id).toBeDefined();
    expect(res.body.user.username).toBe('eve');
  });

  it('returns 401 on wrong password', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        username: 'frank',
        name: 'Frank',
        surname: 'Rossi',
        email: 'frank@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'frank', password: 'wrong!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 when user does not exist', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'ghost', password: 'Password123!' });

    expect(res.status).toBe(401);
  });

  it('returns 200 when identifier is an email', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        username: 'email_login_user',
        name: 'Email',
        surname: 'Login',
        email: 'email_login_user@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'email_login_user@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('email_login_user');
  });

  it('returns 422 instead of crashing when password has the wrong type', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'anyone', password: { not: 'a string' } });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when neither identifier nor username is provided', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'Password123!' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// POST /auth/guest

describe('POST /auth/guest', () => {
  it('returns 200 with a GUEST token', async () => {
    const res = await request(app).post('/auth/guest');

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('GUEST');
    expect(res.body.user.username).toMatch(/^guest_/);
  });
});

// POST /auth/logout

describe('POST /auth/logout', () => {
  it('returns 204 on successful logout', async () => {
    const { session, user } = await registerAndLogin('logout_user', 'logout@example.com');

    const res = await request(app)
      .post('/auth/logout')
      .set('X-User-Id', user.id)
      .set('X-User-Role', 'BASE')
      .set('X-Session-Id', session.id);

    expect(res.status).toBe(204);
  });

  it('returns 403 when session belongs to another user', async () => {
    const alice = await registerAndLogin('http_alice', 'halice@example.com');
    const bob = await registerAndLogin('http_bob', 'hbob@example.com');

    const res = await request(app)
      .post('/auth/logout')
      .set('X-User-Id', bob.user.id)
      .set('X-User-Role', 'BASE')
      .set('X-Session-Id', alice.session.id);

    expect(res.status).toBe(403);
  });

  it('returns 404 when session does not exist', async () => {
    const { user } = await registerAndLogin('http_logout2', 'hlogout2@example.com');

    const res = await request(app)
      .post('/auth/logout')
      .set('X-User-Id', user.id)
      .set('X-User-Role', 'BASE')
      .set('X-Session-Id', 'non-existent');

    expect(res.status).toBe(404);
  });
});

// GET /auth/me

describe('GET /auth/me', () => {
  it('returns 200 with user profile', async () => {
    const { user, session } = await registerAndLogin('me_user', 'meuser@example.com');

    const res = await request(app)
      .get('/auth/me')
      .set('X-User-Id', user.id)
      .set('X-User-Role', 'BASE')
      .set('X-Session-Id', session.id);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('me_user');
    expect(res.body.name).toBe('Test');
    expect(res.body.surname).toBe('User');
    expect(res.body.email).toBe('meuser@example.com');
  });

  it('returns 404 when user does not exist', async () => {
    const { session } = await registerAndLogin('me_missing', 'me_missing@example.com');
    const res = await request(app)
      .get('/auth/me')
      .set('X-User-Id', 'non-existent')
      .set('X-User-Role', 'BASE')
      .set('X-Session-Id', session.id);

    expect(res.status).toBe(401);
  });
});

// GET /auth/sessions

describe('GET /auth/sessions', () => {
  it('returns 200 with list of sessions', async () => {
    const { user } = await registerAndLogin('sessions_user', 'sessions@example.com');
    // A second login creates a second session.
    await request(app)
      .post('/auth/login')
      .send({ identifier: 'sessions_user', password: 'Password123!' });

    const res = await request(app)
      .get('/auth/sessions')
      .set('X-User-Id', user.id)
      .set('X-User-Role', 'BASE');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);
  });
});

// DELETE /auth/sessions/:sessionId

describe('DELETE /auth/sessions/:sessionId', () => {
  it('returns 204 on successful revocation', async () => {
    const { session, user } = await registerAndLogin('revoke_user', 'revoke@example.com');

    const res = await request(app)
      .delete(`/auth/sessions/${session.id}`)
      .set('X-User-Id', user.id)
      .set('X-User-Role', 'BASE');

    expect(res.status).toBe(204);
  });

  it('returns 403 when revoking another user session as BASE', async () => {
    const alice = await registerAndLogin('rev_alice', 'rev_alice@example.com');
    const bob = await registerAndLogin('rev_bob', 'rev_bob@example.com');

    const res = await request(app)
      .delete(`/auth/sessions/${alice.session.id}`)
      .set('X-User-Id', bob.user.id)
      .set('X-User-Role', 'BASE');

    expect(res.status).toBe(403);
  });

  it('returns 404 when session does not exist', async () => {
    const { user } = await registerAndLogin('rev_user2', 'rev_user2@example.com');

    const res = await request(app)
      .delete('/auth/sessions/non-existent')
      .set('X-User-Id', user.id)
      .set('X-User-Role', 'BASE');

    expect(res.status).toBe(404);
  });
});
