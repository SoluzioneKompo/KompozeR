/**
 * Deterministically derives a component SKU from its category, type, and
 * dimensions, following the naming convention already used across the
 * seeded catalog (e.g. "QUADRO-SKU-PIEDINO-140", "QUADRO-SKU-BORDO-200x200").
 *
 * Components with a flat footprint (non-zero width and depth, e.g. shelves)
 * are keyed by "widthxdepth"; components measured along a single axis
 * (e.g. legs, uprights, end caps) are keyed by height alone.
 */
import { ComponentCategory } from '../entities/ComponentCategory';
import { ComponentType }     from '../entities/ComponentType';
import { Dimensions }        from '../entities/Dimensions';

const TYPE_TOKENS: Record<ComponentType, string> = {
  [ComponentType.PIEDINO]:             'PIEDINO',
  [ComponentType.MONTANTE]:            'MONTANTE',
  [ComponentType.RIPIANO]:             'RIPIANO',
  [ComponentType.TERMINALE]:           'TERMINALE',
  [ComponentType.MENSOLA]:             'MENSOLA',
  [ComponentType.RIPIANO_BORDO]:       'BORDO',
  [ComponentType.RIPIANO_INTERMEDIO]:  'INT',
};

export function generateSku(
  category:   ComponentCategory,
  Type:       ComponentType,
  dimensions: Dimensions,
): string {
  const sizeToken = dimensions.widthMm > 0 && dimensions.depthMm > 0
    ? `${dimensions.widthMm}x${dimensions.depthMm}`
    : `${dimensions.heightMm}`;

  return `${category}-SKU-${TYPE_TOKENS[Type]}-${sizeToken}`;
}
