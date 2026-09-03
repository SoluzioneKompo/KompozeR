import { NextFunction, Request, Response } from 'express';
import { logger } from '../../infrastructure/logger';
import { CadError } from '../../domain/entities/errors';

const CODE_TO_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 422,
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_CONFLICT: 409,
  CATEGORY_LOGIC_NOT_IMPLEMENTED: 501,
  FORBIDDEN: 403,
  SESSION_EXPIRED: 410,
  COLLAB_OPERATION_STALE: 409,
};

function statusFor(err: CadError): number {
  return CODE_TO_STATUS[err.code] ?? 500;
}

/**
 * Maps domain errors to API responses and handles unexpected failures.
 */
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
  // Fallback matters: some test setups mount this middleware without pino-http wired.
  const log = req.log ?? logger;

  if (err instanceof CadError) {
    const status = statusFor(err);
    const body = {
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    };

    if (status >= 500) {
      log.error({ err, code: err.code }, 'CAD request failed with an unexpected server error');
    } else {
      // Expected business rejection (not found, conflict, forbidden, ...) —
      // not a bug, but worth an auditable trail of what was rejected and why.
      log.warn({ event: 'cad.request.rejected', code: err.code, status }, err.message);
    }

    res.status(status).json(body);
    return;
  }

  if (isBodyParseError(err)) {
    log.warn({ event: 'cad.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Unexpected error — do not leak internals to the client, but log it in full.
  log.error({ err }, 'Unhandled error in cad service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
