/**
 * Maps OrderError domain exceptions to HTTP JSON responses.
 * Unknown errors are exposed as INTERNAL_ERROR.
 */
import { NextFunction, Request, Response } from 'express';
import { logger } from '../../infrastructure/logger';
import { OrderError } from '../../domain/entities/errors';

const CODE_TO_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 422,
  ORDER_NOT_FOUND: 404,
  FORBIDDEN: 403,
  ORDER_ALREADY_CANCELLED: 409,
  ORDER_ALREADY_DONE: 409,
  ORDER_STATUS_TRANSITION_NOT_ALLOWED: 409,
};

/** Detects the SyntaxError express.json() throws for unparsable request bodies. */
function isBodyParseError(err: unknown): err is SyntaxError {
  return (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: unknown }).status === 400 &&
    'body' in err
  );
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Many HTTP test suites build the router without pino-http wired, so
  // req.log can be undefined there — fall back to the base logger.
  const log = req.log ?? logger;

  if (isBodyParseError(err)) {
    log.warn({ event: 'order.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (err instanceof OrderError) {
    const status = CODE_TO_STATUS[err.code] ?? 500;

    if (status >= 500) {
      log.error({ err, code: err.code }, 'Order service request failed with an unexpected server error');
    } else {
      // Expected business rejection (not found, forbidden, invalid transition, ...) —
      // not a bug, but worth an auditable trail of who was rejected and why.
      log.warn({ event: 'order.request.rejected', code: err.code, status }, err.message);
    }

    res.status(status).json({
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Unexpected error — do not leak internals to the client, but log it in full.
  log.error({ err }, 'Unhandled error in order service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
