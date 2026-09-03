/**
 * Verifies gatewayErrorMiddleware picks the right log level per failure
 * type: warn for expected rejections at the edge (missing/invalid JWT,
 * bad sessionId), error for anything unexpected — so Grafana alerting on
 * error-level logs doesn't fire on ordinary 401s.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { gatewayErrorMiddleware } from '../../src/middleware/gatewayErrorMiddleware';
import { logger } from '../../src/infrastructure/logger';
import { GatewayError, MissingTokenError, InvalidTokenError } from '../../src/errors';

type ErrorRes = Parameters<typeof gatewayErrorMiddleware>[2];
type ErrorReq = Parameters<typeof gatewayErrorMiddleware>[1];

function mockRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as ErrorRes & { status: jest.Mock; json: jest.Mock };
}

const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

afterEach(() => {
  warnSpy.mockClear();
  errorSpy.mockClear();
});

describe('gatewayErrorMiddleware — log level per failure type', () => {
  it('logs a missing token as a warn-level rejection, not an error', () => {
    const res = mockRes();

    gatewayErrorMiddleware(new MissingTokenError(), {}, res, jest.fn());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'gateway.request.rejected', code: 'MISSING_TOKEN', status: 401 }),
      'Authorization header is required',
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('logs an invalid token as a warn-level rejection', () => {
    const res = mockRes();

    gatewayErrorMiddleware(new InvalidTokenError(), {}, res, jest.fn());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'gateway.request.rejected', code: 'INVALID_TOKEN', status: 401 }),
      'Token is invalid or expired',
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a GatewayError with a 5xx status at error level', () => {
    const res = mockRes();

    gatewayErrorMiddleware(new GatewayError('DOWNSTREAM_UNAVAILABLE', 'Downstream service unreachable', 502), {}, res, jest.fn());

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DOWNSTREAM_UNAVAILABLE' }),
      'Gateway request failed with an unexpected server error',
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('logs unhandled errors at error level without leaking them to the client', () => {
    const res = mockRes();
    const unexpected = new Error('ECONNRESET');

    gatewayErrorMiddleware(unexpected, {}, res, jest.fn());

    expect(errorSpy).toHaveBeenCalledWith({ err: unexpected }, 'Unhandled error in api gateway');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) }),
    );
  });

  it('uses req.log when pino-http provides one, instead of the base logger', () => {
    const res = mockRes();
    const childWarn = jest.fn();

    gatewayErrorMiddleware(new MissingTokenError(), { log: { warn: childWarn, error: jest.fn() } }, res, jest.fn());

    expect(childWarn).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
