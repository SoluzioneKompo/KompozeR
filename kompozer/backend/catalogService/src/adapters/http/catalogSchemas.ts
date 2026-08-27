/**
 * Zod request schemas for /catalog write endpoints.
 *
 * Before this, POST/PUT handlers spread the raw request body straight into
 * use case input (`...(req.body as any)`), so `category`/`Type` accepted any
 * string (bypassing the enum), `isAvailable` accepted any type, and
 * `dimensions` accepted any shape — corrupting data CAD compatibility logic
 * relies on downstream. These schemas close that gap at the HTTP boundary.
 */
import { z } from 'zod';
import { ComponentCategory } from '../../domain/entities/ComponentCategory';
import { ComponentType } from '../../domain/entities/ComponentType';

const CATEGORY_VALUES = Object.values(ComponentCategory) as [ComponentCategory, ...ComponentCategory[]];
const TYPE_VALUES = Object.values(ComponentType) as [ComponentType, ...ComponentType[]];

const dimensionsSchema = z
  .object({
    widthMm: z.number().nonnegative(),
    heightMm: z.number().nonnegative(),
    depthMm: z.number().nonnegative(),
  })
  .strict();

export const createComponentSchema = z
  .object({
    sku: z.string().trim().min(1, 'required'),
    name: z.string().trim().min(1, 'required'),
    description: z.string().optional(),
    category: z.enum(CATEGORY_VALUES),
    Type: z.enum(TYPE_VALUES),
    price: z.number(),
    isAvailable: z.boolean(),
    imageUrl: z.string().optional(),
    dimensions: dimensionsSchema,
    compatibleWith: z.array(z.string()).optional(),
  })
  .strict();

export const updateComponentSchema = z
  .object({
    expectedVersion: z.number(),
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    price: z.number().optional(),
    isAvailable: z.boolean().optional(),
    imageUrl: z.string().optional(),
    dimensions: dimensionsSchema.optional(),
    compatibleWith: z.array(z.string()).optional(),
  })
  .strict();
