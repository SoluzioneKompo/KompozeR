/**
 * Full-stack (jwtMiddleware + gatewayErrorMiddleware) check that requests
 * rejected at the edge actually produce a structured log line — the
 * audit trail Grafana/Loki would show for a credential-stuffing attempt —
 * and that the happy path stays silent (no warn/error noise).
 */
import request from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { buildJwtMiddleware } from '../../src/middleware/jwtMiddleware';
import { gatewayErrorMiddleware } from '../../src/middleware/gatewayErrorMiddleware';
import { logger } from '../../src/infrastructure/logger';

const SECRET = 'test-secret';

function buildApp() {
  const app = express();
  app.use(buildJwtMiddleware(SECRET));
  app.get('/protected', (_req: Request, res: Response) => res.json({ ok: true }));
  app.use(gatewayErrorMiddleware);
  return app;
}

const app = buildApp();

const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

afterEach(() => {
  warnSpy.mockClear();
  errorSpy.mockClear();
});

describe('gateway edge rejections — structured logging', () => {
  it('logs MISSING_TOKEN at warn level when Authorization is absent', async () => {
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'gateway.request.rejected', code: 'MISSING_TOKEN' }),
      expect.any(String),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs INVALID_TOKEN at warn level for an expired token', async () => {
    const expired = jwt.sign({ userId: 'u1', tokenId: 't1', role: 'BASE' }, SECRET, { expiresIn: -10 });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'gateway.request.rejected', code: 'INVALID_TOKEN' }),
      expect.any(String),
    );
  });

  it('does not log anything on a valid, accepted request', async () => {
    const token = jwt.sign({ userId: 'u1', tokenId: 't1', role: 'BASE' }, SECRET, { expiresIn: 3600 });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
