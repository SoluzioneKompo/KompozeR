/** Shared category/type grouping logic for catalog browsing and admin views. */
import type { CatalogItem, ComponentType } from '@/types/catalog';
import type { Category } from '@/types/cad';
import { i18n } from '@/i18n';

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

/** Translated display label for a catalog category — reactive to the active locale. */
export function categoryLabel(category: Category): string {
  return i18n.global.t(`catalog.category.${category}`);
}

/** Translated display label for a component type — reactive to the active locale. */
export function typeLabel(type: ComponentType): string {
  return i18n.global.t(`catalog.componentType.${type}`);
}

const HEIGHT_ONLY_TYPES: ComponentType[] = ['PIEDINO', 'MONTANTE', 'TERMINALE'];

export function dimensionLabel(item: CatalogItem): string {
  if (!item.dimensions) return item.name;
  const { widthMm, heightMm, depthMm } = item.dimensions;
  const h = i18n.global.t('catalog.dimension.height');
  if (HEIGHT_ONLY_TYPES.includes(item.Type)) {
    return `${h}${heightMm} mm`;
  }
  const w = i18n.global.t('catalog.dimension.width');
  const d = i18n.global.t('catalog.dimension.depth');
  return `${w}${widthMm} × ${h}${heightMm} × ${d}${depthMm} mm`;
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
        label: typeLabel(type),
        variants: [...variants].sort((a, b) => volume(a) - volume(b)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    groups.push({ category: cat, label: categoryLabel(cat), types });
  }

  return groups;
}
