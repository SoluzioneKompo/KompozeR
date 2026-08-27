/**
 * Zod request schemas for /orders write endpoints.
 *
 * Before this, POST / cast the raw body to a type without any runtime
 * check, so each order item's sku/name/unitPrice/quantity could be any
 * shape and got persisted as-is (order total was checked, but nothing
 * tied it back to the per-item numbers). These schemas close that gap.
 */
import { z } from 'zod';

const expeditionInfoSchema = z
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
  .strict();

const orderItemSchema = z
  .object({
    sku: z.string().trim().min(1, 'required'),
    name: z.string().trim().min(1, 'required'),
    unitPrice: z.number(),
    quantity: z.number(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    expeditionInfo: expeditionInfoSchema,
    items: z.array(orderItemSchema).min(1, 'items must contain at least one element'),
    total: z.number(),
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: z.literal('DONE'),
  })
  .strict();
