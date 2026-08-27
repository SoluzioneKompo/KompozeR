/**
 * Centralized API Gateway error handler.
 *
 * Translates GatewayError instances to the project's standard JSON error
 * payload. Unknown errors are intentionally masked as INTERNAL_ERROR.
 */
import { GatewayError } from '../errors';

type ErrorResponseLike = {
  status: (code: number) => {
    json: (payload: unknown) => void;
  };
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
  _req: unknown,
  res: ErrorResponseLike,
  _next: NextLike,
): void {
  if (err instanceof GatewayError) {
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
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
