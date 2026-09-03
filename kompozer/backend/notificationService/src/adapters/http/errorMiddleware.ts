/**
 * Maps NotificationError domain exceptions to HTTP JSON responses.
 * Unknown errors are returned as INTERNAL_ERROR.
 */
import { NextFunction, Request, Response } from 'express';
import { logger } from '../../infrastructure/logger';
import { NotificationError } from '../../domain/entities/errors';

const CODE_TO_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 422,
  NOTIFICATION_NOT_FOUND: 404,
  SUBSCRIPTION_NOT_FOUND: 404,
  FORBIDDEN: 403,
};

function statusFor(err: NotificationError): number {
  return CODE_TO_STATUS[err.code] ?? 500;
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

  if (err instanceof NotificationError) {
    const status = statusFor(err);

    if (status >= 500) {
      log.error(
        { err, code: err.code },
        'Notification request failed with an unexpected server error',
      );
    } else {
      // Expected business rejection (not found, forbidden, validation, ...) —
      // not a bug, but worth an auditable trail of who was rejected and why.
      log.warn({ event: 'notification.request.rejected', code: err.code, status }, err.message);
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

  if (isBodyParseError(err)) {
    log.warn({ event: 'notification.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
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
  log.error({ err }, 'Unhandled error in notification service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
