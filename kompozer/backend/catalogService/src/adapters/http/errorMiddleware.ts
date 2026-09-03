/**
 * Maps domain errors to HTTP JSON responses.
 * Maps CatalogError `code` values to proper HTTP status codes.
 * Unknown errors are returned as 500.
 */
import { Request, Response, NextFunction } from 'express';
import { CatalogError }                    from '../../domain/entities/errors';
import { logger }                          from '../../infrastructure/logger';

const CODE_TO_STATUS: Record<string, number> = {
  COMPONENT_NOT_FOUND:  404,
  DUPLICATE_SKU:        409,
  VERSION_CONFLICT:     409,
  VALIDATION_ERROR:     422,
  INSUFFICIENT_STOCK:   409,
};

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const log = req.log ?? logger; // fallback matters: some test setups mount this middleware without pino-http wired

  if (isBodyParseError(err)) {
    log.warn({ event: 'catalog.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (err instanceof CatalogError) {
    const status = CODE_TO_STATUS[err.code] ?? 500;
    const body: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    };

    if ('details' in err && Array.isArray((err as { details?: unknown[] }).details)) {
      const details = (err as { details?: unknown[] }).details;
      if (details && details.length > 0) {
        body.error.details = details;
      }
    }

    if (status >= 500) {
      log.error({ err, code: err.code }, 'Catalog request failed with an unexpected server error');
    } else {
      // Expected business rejection (not found, validation, forbidden, duplicate, ...) — not a bug.
      log.warn({ event: 'catalog.request.rejected', code: err.code, status }, err.message);
    }

    res.status(status).json(body);
    return;
  }

  log.error({ err }, 'Unhandled error in catalog service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
