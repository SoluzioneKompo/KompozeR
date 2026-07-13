import { Category } from '../entities/Category';
import { CategoryLogicNotImplementedError } from '../entities/errors';

export type Step4LogicFamily = 'STANDARD' | 'KUBE' | 'INTELLIGENTE';

/**
 * Resolves which Step4 logic family must be used for a selected category.
 */
export function resolveStep4LogicFamily(category: Category): Step4LogicFamily {
  if (category === 'TONDO' || category === 'QUADRO') {
    return 'STANDARD';
  }
  if (category === 'KUBE') {
    return 'KUBE';
  }
  return 'INTELLIGENTE';
}

/**
 * Guard used by Step4 flows until category-specific strategies are implemented.
 */
export function assertStep4LogicImplemented(category: Category): void {
  const logicFamily = resolveStep4LogicFamily(category);
  if (logicFamily !== 'STANDARD' && logicFamily !== 'INTELLIGENTE') {
    throw new CategoryLogicNotImplementedError(category);
  }
}
