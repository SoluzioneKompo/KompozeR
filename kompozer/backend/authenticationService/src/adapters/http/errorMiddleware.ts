/**
 * Centralized Express error middleware for the Authentication Service.
 *
 * Intercepts AuthError instances raised by use cases and maps them to HTTP
 * responses aligned with the project REST error model
 * ({ error: { code, message, details, timestamp } }).
 *
 * Unknown errors are masked and returned as 500 INTERNAL_ERROR.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logger';
import {
  AuthError,
  ValidationError,
  DuplicateUsernameError,
  DuplicateEmailError,
  InvalidCredentialsError,
  InvalidPasswordError,
  SessionNotFoundError,
  UserNotFoundError,
  SessionRevokedError,
  ForbiddenError,
} from '../../domain/entities/errors';

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
    traceId?: string;
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

function statusFor(err: AuthError): number {
  if (err instanceof ValidationError) return 422;
  if (err instanceof DuplicateUsernameError || err instanceof DuplicateEmailError) return 409;
  if (err instanceof InvalidCredentialsError || err instanceof InvalidPasswordError) return 401;
  if (err instanceof SessionNotFoundError || err instanceof UserNotFoundError) return 404;
  if (err instanceof SessionRevokedError) return 401;
  if (err instanceof ForbiddenError) return 403;
  return 500;
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const log = req.log ?? logger;

  if (err instanceof AuthError) {
    const status = statusFor(err);
    const body: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    };

    if (err instanceof ValidationError && err.details.length > 0) {
      body.error.details = err.details;
    }

    if (status >= 500) {
      log.error({ err, code: err.code }, 'Auth request failed with an unexpected server error');
    } else {
      // Expected business rejection (bad credentials, duplicate email, forbidden, ...) —
      // not a bug, but worth an auditable trail of who was rejected and why.
      log.warn({ event: 'auth.request.rejected', code: err.code, status }, err.message);
    }

    res.status(status).json(body);
    return;
  }

  if (isBodyParseError(err)) {
    log.warn({ event: 'auth.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
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
  log.error({ err }, 'Unhandled error in authentication service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
