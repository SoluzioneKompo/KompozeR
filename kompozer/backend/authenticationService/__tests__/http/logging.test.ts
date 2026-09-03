/**
 * Verifies /auth routes emit structured, high-level log events — the actual
 * audit trail consumed by Grafana/Loki, not just the HTTP status code.
 *
 * buildTestApp() mounts the router without pino-http, so authRouter falls
 * back to the shared `logger` singleton; spying on it is enough to observe
 * what would otherwise reach stdout/Loki.
 */
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { buildTestApp } from '../helpers/buildTestApp';
import { logger } from '../../src/infrastructure/logger';

const app = buildTestApp();

const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

function lastCall(spy: jest.SpiedFunction<typeof logger.info>) {
  const call = spy.mock.calls[spy.mock.calls.length - 1];
  if (!call) throw new Error('logger was not called');
  return call as [Record<string, unknown>, string];
}

async function registerAndLogin(username: string, email: string) {
  const reg = await request(app)
    .post('/auth/register')
    .send({ username, name: 'Test', surname: 'User', email, password: 'Password123!' });
  const login = await request(app)
    .post('/auth/login')
    .send({ identifier: username, password: 'Password123!' });
  return { user: reg.body.user, session: login.body.session };
}

describe('auth events — structured logging', () => {
  it('logs auth.register.success at info level with the new user id', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'log_alice',
        name: 'Alice',
        surname: 'Rossi',
        email: 'log_alice@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(201);
    const [fields, msg] = lastCall(infoSpy);
    expect(fields).toMatchObject({
      event: 'auth.register.success',
      userId: res.body.user.id,
      username: 'log_alice',
    });
    expect(msg).toBe('User registered');
  });

  it('logs auth.login.success at info level with the user id', async () => {
    await registerAndLogin('log_bob', 'log_bob@example.com');
    infoSpy.mockClear();

    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'log_bob', password: 'Password123!' });

    expect(res.status).toBe(200);
    const [fields] = lastCall(infoSpy);
    expect(fields).toMatchObject({
      event: 'auth.login.success',
      userId: res.body.user.id,
      username: 'log_bob',
    });
  });

  it('logs auth.guest.created at info level', async () => {
    const res = await request(app).post('/auth/guest');

    expect(res.status).toBe(200);
    const [fields] = lastCall(infoSpy);
    expect(fields).toMatchObject({
      event: 'auth.guest.created',
      userId: res.body.user.id,
      sessionId: res.body.session.id,
    });
  });

  it('logs auth.logout.success at info level', async () => {
    const { user, session } = await registerAndLogin('log_carl', 'log_carl@example.com');

    const res = await request(app)
      .post('/auth/logout')
      .set('X-User-Id', user.id)
      .set('X-Session-Id', session.id);

    expect(res.status).toBe(204);
    const [fields] = lastCall(infoSpy);
    expect(fields).toMatchObject({
      event: 'auth.logout.success',
      userId: user.id,
      sessionId: session.id,
    });
  });

  it('logs auth.session.revoked at info level', async () => {
    const { user, session } = await registerAndLogin('log_dave', 'log_dave@example.com');

    const res = await request(app)
      .delete(`/auth/sessions/${session.id}`)
      .set('X-User-Id', user.id);

    expect(res.status).toBe(204);
    const [fields] = lastCall(infoSpy);
    expect(fields).toMatchObject({
      event: 'auth.session.revoked',
      requestingUserId: user.id,
      sessionId: session.id,
    });
  });

  it('logs bad credentials as a warn-level rejection, never as an error', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'nobody', password: 'wrong' });

    expect(res.status).toBe(401);
    const [fields, msg] = lastCall(warnSpy);
    expect(fields).toMatchObject({
      event: 'auth.request.rejected',
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
    expect(msg).toBe('Invalid username or password');
    // A rejected login is expected traffic, not a bug — must not pollute error-level alerts.
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
