/**
 * TDD coverage for gateway JWT middleware.
 * Verifies public-route bypass, protected-route Bearer validation,
 * identity header injection, and 401 handling for malformed/expired tokens.
 */
import request from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { buildJwtMiddleware } from '../../src/middleware/jwtMiddleware';
import { gatewayErrorMiddleware } from '../../src/middleware/gatewayErrorMiddleware';

const SECRET = 'test-secret';

function buildApp() {
  const app = express();
  app.use(buildJwtMiddleware(SECRET));

  // Echo endpoint: returns received headers to verify injection behavior.
  app.get('/protected', (req: Request, res: Response) => {
    res.json({
      userId: req.headers['x-user-id'],
      role: req.headers['x-user-role'],
      sessionId: req.headers['x-session-id'],
    });
  });

  app.get('/cad/collab/socket.io', (req: Request, res: Response) => {
    res.json({
      userId: req.headers['x-user-id'],
      role: req.headers['x-user-role'],
      sessionId: req.headers['x-session-id'],
    });
  });

  app.post('/auth/register', (_req: Request, res: Response) => res.status(201).json({}));
  app.post('/auth/login', (_req: Request, res: Response) => res.json({}));
  app.post('/auth/guest', (_req: Request, res: Response) => res.json({}));

  app.use(gatewayErrorMiddleware);
  return app;
}

function makeToken(payload: object, secret = SECRET, options?: SignOptions) {
  return jwt.sign(payload, secret, { expiresIn: 3600, ...options });
}

const app = buildApp();

describe('jwtMiddleware - public routes', () => {
  it('POST /auth/register passes without Authorization header', async () => {
    const res = await request(app).post('/auth/register');
    expect(res.status).toBe(201);
  });

  it('POST /auth/login passes without Authorization header', async () => {
    const res = await request(app).post('/auth/login');
    expect(res.status).toBe(200);
  });

  it('POST /auth/guest passes without Authorization header', async () => {
    const res = await request(app).post('/auth/guest');
    expect(res.status).toBe(200);
  });
});

describe('jwtMiddleware - protected routes', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('returns 401 when scheme is not Bearer', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when token is signed with wrong secret', async () => {
    const token = makeToken({ userId: 'u1', tokenId: 'tok1', role: 'BASE' }, 'wrong-secret');
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when token is expired', async () => {
    const token = makeToken(
      { userId: 'u1', tokenId: 'tok1', role: 'BASE' },
      SECRET,
      { expiresIn: -1 },
    );
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('injects X-User-Id, X-User-Role, and X-Session-Id for valid token', async () => {
    const token = makeToken({ userId: 'usr-42', tokenId: 'tok-99', role: 'BASE' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('usr-42');
    expect(res.body.role).toBe('BASE');
    expect(res.body.sessionId).toBe('tok-99');
  });

  it('injects ADMIN role correctly', async () => {
    const token = makeToken({ userId: 'admin-1', tokenId: 'tok-admin', role: 'ADMIN' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
  });

  it('injects GUEST role correctly', async () => {
    const token = makeToken({ userId: 'gst-1', tokenId: 'tok-gst', role: 'GUEST' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('GUEST');
  });

  it('accepts ?token fallback on CAD collaborative socket handshake path', async () => {
    const token = makeToken({ userId: 'cad-user-1', tokenId: 'cad-tok-1', role: 'BASE' });
    const res = await request(app).get(`/cad/collab/socket.io?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('cad-user-1');
    expect(res.body.role).toBe('BASE');
    expect(res.body.sessionId).toBe('cad-tok-1');
  });
});

describe('jwtMiddleware - strip incoming headers (OWASP A01)', () => {
  // Unauthenticated clients must not spoof x-user-id on public routes
  // to trick downstream services into trusting forged identity.
  it('strips forged X-User-Id on public route', async () => {
    // Build a separate app with a public handler that echoes headers.
    const echoApp = express();
    echoApp.use(buildJwtMiddleware(SECRET));
    echoApp.post('/auth/login', (req: Request, res: Response) => {
      res.json({
        userId: req.headers['x-user-id'] ?? null,
        role: req.headers['x-user-role'] ?? null,
        sessionId: req.headers['x-session-id'] ?? null,
      });
    });
    echoApp.use(gatewayErrorMiddleware);

    const res = await request(echoApp)
      .post('/auth/login')
      .set('X-User-Id', 'spoofed-admin')
      .set('X-User-Role', 'ADMIN')
      .set('X-Session-Id', 'spoofed-session');

    expect(res.status).toBe(200);
    // Middleware must remove all three headers before passing downstream.
    expect(res.body.userId).toBeNull();
    expect(res.body.role).toBeNull();
    expect(res.body.sessionId).toBeNull();
  });

  it('strips forged X-User-Id on protected route (even with valid token)', async () => {
    const token = makeToken({ userId: 'real-user', tokenId: 'real-tok', role: 'BASE' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .set('X-User-Id', 'spoofed-admin')
      .set('X-User-Role', 'ADMIN');

    expect(res.status).toBe(200);
    // Value must come only from JWT payload, not incoming header.
    expect(res.body.userId).toBe('real-user');
    expect(res.body.role).toBe('BASE');
  });
});
