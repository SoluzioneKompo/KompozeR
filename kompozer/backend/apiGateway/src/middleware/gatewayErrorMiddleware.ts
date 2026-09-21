/**
 * Centralized API Gateway error handler.
 *
 * Translates GatewayError instances to the project's standard JSON error
 * payload. Unknown errors are intentionally masked as INTERNAL_ERROR.
 */
import { GatewayError } from '../errors';
import { logger } from '../infrastructure/logger';

type ErrorResponseLike = {
  status: (code: number) => {
    json: (payload: unknown) => void;
  };
};

type RequestLike = {
  log?: { warn: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void };
};

type NextLike = (err?: unknown) => void;

/** Detects the SyntaxError express.json() throws for unparsable request bodies. */
function isBodyParseError(err: unknown): err is SyntaxError {
  return (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: unknown }).status === 400 &&
    'body' in err
  );
}

/**
 * Converts thrown gateway errors into consistent HTTP JSON responses.
 */
export function gatewayErrorMiddleware(
  err: unknown,
  req: RequestLike,
  res: ErrorResponseLike,
  _next: NextLike,
): void {
  const log = req.log ?? logger;

  if (err instanceof GatewayError) {
    if (err.status >= 500) {
      log.error({ err, code: err.code }, 'Gateway request failed with an unexpected server error');
    } else {
      // Expected rejection (missing/invalid JWT, bad sessionId, ...) — an
      // auditable trail of who was turned away at the edge and why.
      log.warn({ event: 'gateway.request.rejected', code: err.code, status: err.status }, err.message);
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (isBodyParseError(err)) {
    log.warn({ event: 'gateway.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  log.error({ err }, 'Unhandled error in api gateway');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
