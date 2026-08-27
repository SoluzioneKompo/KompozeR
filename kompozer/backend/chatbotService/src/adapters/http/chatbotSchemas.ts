/**
 * Zod request schemas for /sessions endpoints.
 *
 * Before this, `content` fell back to `''` only on null/undefined
 * (`body.content ?? ''`), so an object/array/number slipped through as
 * truthy and reached `input.content.trim()` in SendSessionMessage,
 * throwing an uncaught TypeError (masked as a 500). These schemas reject
 * the wrong type at the HTTP boundary instead.
 */
import { z } from 'zod';

export const createSessionSchema = z
  .object({
    configurationId: z.string().trim().min(1).optional(),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1, 'content is required'),
  })
  .strict();
