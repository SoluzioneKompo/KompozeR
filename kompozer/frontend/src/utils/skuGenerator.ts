/**
 * Live preview of the catalog SKU, mirroring the backend's authoritative
 * generator (catalogService/src/domain/services/generateSku.ts) so the admin
 * create form can show it as the user fills in category/type/dimensions.
 *
 * The backend always computes the real SKU on creation (and appends a
 * numeric suffix if the same specs already exist) — this preview is
 * informational only and is never sent to the API.
 */
import type { ComponentType } from '@/types/catalog';
import type { Category } from '@/types/cad';

const TYPE_TOKENS: Record<ComponentType, string> = {
  PIEDINO: 'PIEDINO',
  MONTANTE: 'MONTANTE',
  RIPIANO: 'RIPIANO',
  TERMINALE: 'TERMINALE',
  MENSOLA: 'MENSOLA',
  RIPIANO_BORDO: 'BORDO',
  RIPIANO_INTERMEDIO: 'INT',
};

export interface SkuPreviewDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export function previewSku(category: Category, type: ComponentType, dimensions: SkuPreviewDimensions): string {
  const sizeToken = dimensions.widthMm > 0 && dimensions.depthMm > 0
    ? `${dimensions.widthMm}x${dimensions.depthMm}`
    : `${dimensions.heightMm}`;

  return `${category}-SKU-${TYPE_TOKENS[type]}-${sizeToken}`;
}
