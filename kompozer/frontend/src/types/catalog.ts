/** Catalog domain contracts for product listing and administrative operations. */
import type { Category } from '@/types/cad';

/** Component type (mirror of backend catalogService ComponentType enum). */
export type ComponentType =
  | 'PIEDINO'
  | 'MONTANTE'
  | 'RIPIANO'
  | 'TERMINALE'
  | 'MENSOLA'
  | 'RIPIANO_BORDO'
  | 'RIPIANO_INTERMEDIO';

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: Category;
  Type: ComponentType;
  price: number;
  isAvailable: boolean;
  imageUrl: string;
  dimensions?: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
  };
  compatibleWith?: string[];
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogListDto {
  items: CatalogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
