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
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AuthError) {
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

    res.status(statusFor(err)).json(body);
    return;
  }

  if (isBodyParseError(err)) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Unexpected error — do not leak internals
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
