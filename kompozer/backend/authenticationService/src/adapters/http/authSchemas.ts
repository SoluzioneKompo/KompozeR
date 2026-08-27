/**
 * Zod request schemas for /auth endpoints.
 *
 * Rejects malformed shapes (wrong types, missing fields, unknown fields)
 * at the HTTP boundary, before requests reach use cases. Field-level
 * business rules (uniqueness, credential matching) stay in the use cases.
 */
import { z } from 'zod';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

export const registerSchema = z
  .object({
    username: z.string().trim().min(1, 'Username is required'),
    name: z.string().trim().min(1, 'Name is required').max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`),
    surname: z.string().trim().min(1, 'Surname is required').max(MAX_NAME_LENGTH, `Surname must be at most ${MAX_NAME_LENGTH} characters`),
    email: z.string().regex(EMAIL_RE, 'Valid email is required'),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  })
  .strict();

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .strict()
  .refine((data) => Boolean(data.identifier ?? data.username), {
    message: 'identifier is required',
    path: ['identifier'],
  });
