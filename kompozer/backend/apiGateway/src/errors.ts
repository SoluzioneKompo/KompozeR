/**
 * Base gateway domain error.
 *
 * Carries a machine-readable error code and an HTTP status used by
 * the gateway error middleware to produce a uniform JSON error model.
 */
export class GatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Raised when a protected route is called without a bearer token.
 */
export class MissingTokenError extends GatewayError {
  constructor() {
    super('MISSING_TOKEN', 'Authorization header is required', 401);
  }
}

/**
 * Raised when token validation fails (invalid format, signature, or expiry).
 */
export class InvalidTokenError extends GatewayError {
  constructor() {
    super('INVALID_TOKEN', 'Token is invalid or expired', 401);
  }
}

/**
 * Raised when a path param forwarded into a downstream URL segment
 * (e.g. sessionId) does not match the expected safe format.
 */
export class InvalidSessionIdError extends GatewayError {
  constructor() {
    super('VALIDATION_ERROR', 'sessionId has an invalid format', 422);
  }
}
