export const CATEGORIES = ['TONDO', 'QUADRO', 'KUBE'] as const;

export type Category = (typeof CATEGORIES)[number];

/** Type guard for accepted CAD categories. */
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && CATEGORIES.includes(value as Category);
}
