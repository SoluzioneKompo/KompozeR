import { NextFunction, Request, Response } from 'express';
import { ReportingError } from '../../domain/entities/errors';
import { logger } from '../../infrastructure/logger';

const CODE_TO_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 422,
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
  const log = req.log ?? logger;

  if (isBodyParseError(err)) {
    log.warn({ event: 'reporting.request.rejected', code: 'INVALID_REQUEST' }, 'Malformed JSON body');
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON body',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (err instanceof ReportingError) {
    const status = CODE_TO_STATUS[err.code] ?? 500;
    if (status >= 500) {
      log.error({ err, code: err.code }, 'Reporting service request failed with an unexpected server error');
    } else {
      log.warn({ event: 'reporting.request.rejected', code: err.code, status }, err.message);
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

  log.error({ err }, 'Unhandled error in reporting service');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
