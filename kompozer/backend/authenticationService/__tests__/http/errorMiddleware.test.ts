/**
 * Verifies errorMiddleware picks the right log level per failure type:
 * warn for expected business rejections (bad request, they are not bugs),
 * error for anything unexpected (unmapped codes, real exceptions) — so
 * Grafana alerting on error-level logs doesn't fire on ordinary 401s/404s.
 */
import { Request, Response, NextFunction } from 'express';
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { errorMiddleware } from '../../src/adapters/http/errorMiddleware';
import { logger } from '../../src/infrastructure/logger';
import { AuthError, InvalidCredentialsError } from '../../src/domain/entities/errors';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
  return res as Response;
}

const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

afterEach(() => {
  warnSpy.mockClear();
  errorSpy.mockClear();
});

describe('errorMiddleware — log level per failure type', () => {
  it('logs a known business rejection at warn, not error', () => {
    const res = mockRes();

    errorMiddleware(new InvalidCredentialsError(), {} as Request, res, jest.fn() as NextFunction);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.request.rejected', code: 'INVALID_CREDENTIALS', status: 401 }),
      'Invalid username or password',
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('logs an AuthError with no HTTP mapping (falls back to 500) at error level', () => {
    const res = mockRes();

    errorMiddleware(new AuthError('WEIRD_CODE', 'Something odd'), {} as Request, res, jest.fn() as NextFunction);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WEIRD_CODE' }),
      'Auth request failed with an unexpected server error',
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('logs unhandled errors at error level, with the original error, without leaking it to the client', () => {
    const res = mockRes();
    const dbError = new Error('db connection reset');

    errorMiddleware(dbError, {} as Request, res, jest.fn() as NextFunction);

    expect(errorSpy).toHaveBeenCalledWith({ err: dbError }, 'Unhandled error in authentication service');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) }),
    );
  });

  it('logs malformed JSON bodies as a warn-level rejection', () => {
    const res = mockRes();
    const bodyParseErr = Object.assign(new SyntaxError('Unexpected token'), { status: 400, body: '{' });

    errorMiddleware(bodyParseErr, {} as Request, res, jest.fn() as NextFunction);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.request.rejected', code: 'INVALID_REQUEST' }),
      'Malformed JSON body',
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('uses req.log when pino-http provides one, instead of the base logger', () => {
    const res = mockRes();
    const childWarn = jest.fn();
    const req = { log: { warn: childWarn } } as unknown as Request;

    errorMiddleware(new InvalidCredentialsError(), req, res, jest.fn() as NextFunction);

    expect(childWarn).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
