/** Shared category/type grouping logic for catalog browsing and admin views. */
import type { CatalogItem, ComponentType } from '@/types/catalog';
import type { Category } from '@/types/cad';

export interface TypeGroup {
  key: string;
  type: ComponentType;
  label: string;
  variants: CatalogItem[];
}

export interface CategoryGroup {
  category: Category;
  label: string;
  types: TypeGroup[];
}

export const CATEGORY_ORDER: Category[] = ['TONDO', 'QUADRO', 'KUBE', 'INTELLIGENTE'];

export const CATEGORY_LABELS: Record<Category, string> = {
  TONDO: 'Tondo',
  QUADRO: 'Quadro',
  KUBE: 'Kube',
  INTELLIGENTE: 'Intelligente',
};

export const TYPE_LABELS: Record<ComponentType, string> = {
  PIEDINO: 'Piedino',
  MONTANTE: 'Montante',
  RIPIANO: 'Ripiano',
  TERMINALE: 'Terminale',
  MENSOLA: 'Mensola',
  RIPIANO_BORDO: 'Ripiano bordo',
  RIPIANO_INTERMEDIO: 'Ripiano intermedio',
};

const HEIGHT_ONLY_TYPES: ComponentType[] = ['PIEDINO', 'MONTANTE', 'TERMINALE'];

export function dimensionLabel(item: CatalogItem): string {
  if (!item.dimensions) return item.name;
  const { widthMm, heightMm, depthMm } = item.dimensions;
  if (HEIGHT_ONLY_TYPES.includes(item.Type)) {
    return `H${heightMm} mm`;
  }
  return `L${widthMm} × H${heightMm} × P${depthMm} mm`;
}

export function volume(item: CatalogItem): number {
  if (!item.dimensions) return 0;
  const { widthMm, heightMm, depthMm } = item.dimensions;
  return widthMm * heightMm * depthMm;
}

/** Groups flat catalog items into Category -> Type -> size-sorted variants. */
export function groupCatalog(items: CatalogItem[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];

  for (const cat of CATEGORY_ORDER) {
    const categoryItems = items.filter((item) => item.category === cat);
    if (categoryItems.length === 0) continue;

    const typeMap = new Map<ComponentType, CatalogItem[]>();
    for (const item of categoryItems) {
      const bucket = typeMap.get(item.Type) ?? [];
      bucket.push(item);
      typeMap.set(item.Type, bucket);
    }

    const types: TypeGroup[] = Array.from(typeMap.entries())
      .map(([type, variants]) => ({
        key: `${cat}__${type}`,
        type,
        label: TYPE_LABELS[type] ?? type,
        variants: [...variants].sort((a, b) => volume(a) - volume(b)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    groups.push({ category: cat, label: CATEGORY_LABELS[cat], types });
  }

  return groups;
}
