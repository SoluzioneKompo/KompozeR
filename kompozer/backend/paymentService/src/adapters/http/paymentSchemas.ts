/**
 * Zod request schemas for /payments write endpoints.
 */
import { z } from 'zod';

export const createPaymentSchema = z
  .object({
    orderId: z.string().trim().min(1, 'required'),
    method: z.enum(['PAYPAL', 'CARD']),
    amount: z.number(),
    currency: z.string(),
  })
  .strict();

export const confirmPaymentSchema = z
  .object({
    status: z.enum(['COMPLETED', 'FAILED']),
    failureReason: z.string().optional(),
  })
  .strict();
