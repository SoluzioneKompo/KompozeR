/**
 * Generic request-body schema validation middleware.
 *
 * Parses req.body against a Zod schema before it reaches any use case.
 * On failure, raises the existing ValidationError so errorMiddleware needs
 * no changes. On success, req.body is replaced with the parsed output —
 * unknown fields are rejected, preventing mass-assignment style payloads.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { ValidationError } from '../../domain/entities/errors';

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
        .join('; ');
      next(new ValidationError(message));
      return;
    }
    req.body = result.data;
    next();
  };
}
