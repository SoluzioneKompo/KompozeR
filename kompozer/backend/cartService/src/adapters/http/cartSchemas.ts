/**
 * Zod request schemas for /cart endpoints.
 *
 * Rejects malformed shapes (wrong types, unknown fields) at the HTTP
 * boundary. Business-level rules (max lengths, email/cap format) stay
 * in the use cases (UpsertCartItem, CheckoutCart) as the single source
 * of truth for those constraints.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../domain/entities/errors';

const SKU_RE = /^[A-Za-z0-9._-]{1,64}$/;

export const upsertCartItemSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    unitPrice: z.number(),
    quantity: z.number(),
  })
  .strict();

export const checkoutSchema = z
  .object({
    expeditionInfo: z
      .object({
        name: z.string(),
        surname: z.string(),
        mail: z.string(),
        nation: z.string(),
        city: z.string(),
        cap: z.string(),
        address: z.string(),
        phone: z.string(),
        deliveryNotes: z.string().optional(),
      })
      .strict(),
  })
  .strict();

/** Validates the :sku route param — used as a Mongo/Redis key downstream. */
export function validateSkuParam(req: Request, _res: Response, next: NextFunction): void {
  const sku = req.params['sku'];
  if (!sku || !SKU_RE.test(sku)) {
    next(new ValidationError('sku must be 1-64 characters of letters, digits, dot, dash or underscore'));
    return;
  }
  next();
}
