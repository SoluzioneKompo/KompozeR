/**
 * Maps domain CartError instances to HTTP JSON responses.
 * Unknown errors are masked as INTERNAL_ERROR.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logger';
import { CartError } from '../../domain/entities/errors';

const CODE_TO_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 422,
  CART_EMPTY: 409,
  ITEM_UNAVAILABLE: 409,
  PRICE_CHANGED: 409,
  CATALOG_LOOKUP_FAILED: 503,
  ORDER_SUBMISSION_FAILED: 503,
};

interface ApiError {
  error: {
    code: string;
    message: string;
    timestamp: string;
  };
}

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
  const log = req.log ?? logger;

  if (isBodyParseError(err)) {
    log.warn({ event: 'cart.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (err instanceof CartError) {
    const status = CODE_TO_STATUS[err.code] ?? 500;
    const body: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    };

    if (status >= 500) {
      log.error({ err, code: err.code }, 'Cart request failed with an unexpected server error');
    } else {
      // Expected business rejection (cart empty, item unavailable, price changed, ...) —
      // not a bug, but worth an auditable trail of what got rejected and why.
      log.warn({ event: 'cart.request.rejected', code: err.code, status }, err.message);
    }

    res.status(status).json(body);
    return;
  }

  // Unexpected error — do not leak internals to the client, but log it in full.
  log.error({ err }, 'Unhandled error in cart service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
