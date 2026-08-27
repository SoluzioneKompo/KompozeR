/**
 * Zod request schemas for /subscriptions endpoints.
 *
 * Before this, POST/PATCH only checked `events` was a non-empty array —
 * never that each element was one of the two known event types. Garbage
 * values would get deduped, persisted, and silently never match anything
 * in listActiveSubscriptionsBySkuAndEvent. These schemas close that gap.
 */
import { z } from 'zod';

const eventTypeSchema = z.enum(['PRICE_CHANGED', 'AVAILABILITY_CHANGED']);

export const createSubscriptionSchema = z
  .object({
    scope: z.literal('PRODUCT'),
    targetId: z.string().trim().min(1, 'required'),
    events: z.array(eventTypeSchema).min(1, 'events must be a non-empty array'),
    channel: z.literal('IN_APP'),
  })
  .strict();

export const updateSubscriptionSchema = z
  .object({
    events: z.array(eventTypeSchema).min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
