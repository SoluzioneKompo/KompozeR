import { Category } from '../entities/Category';

export type Step4LogicFamily = 'STANDARD' | 'QUADRO' | 'KUBE';

/**
 * Resolves which Step4 logic family must be used for a selected category.
 */
export function resolveStep4LogicFamily(category: Category): Step4LogicFamily {
  if (category === 'TONDO') {
    return 'STANDARD';
  }
  if (category === 'QUADRO') {
    return 'QUADRO';
  }
  return 'KUBE';
}

/**
 * Guard used by Step4 flows for category-specific strategies. All three
 * families (STANDARD, QUADRO, KUBE) are implemented; kept as a single choke
 * point should a future category need to be staged in disabled first.
 */
export function assertStep4LogicImplemented(_category: Category): void {
  // no-op
}
