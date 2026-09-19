/** Catalog API client for browsing, filtering, and admin catalog management. */
import { http } from './httpClient';
import type { CatalogItem, CatalogListDto } from '@/types/catalog';

export interface CatalogListParams {
  search?: string;
  category?: string;
  available?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateCatalogComponentInput {
  name: string;
  description: string;
  category: string;
  Type: string;
  price: number;
  isAvailable: boolean;
  imageUrl: string;
  dimensions: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
  };
  compatibleWith: string[];
}

export interface UpdateCatalogComponentInput {
  expectedVersion: number;
  price?: number;
  isAvailable?: boolean;
}

export const catalogService = {
  list(params: CatalogListParams = {}): Promise<CatalogListDto> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    if (params.available !== undefined) query.set('available', String(params.available));
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return http.get<CatalogListDto>(`/catalog${qs ? `?${qs}` : ''}`);
  },

  get(id: string): Promise<CatalogItem> {
    return http.get<CatalogItem>(`/catalog/${id}`);
  },

  create(input: CreateCatalogComponentInput): Promise<CatalogItem> {
    return http.post<CatalogItem>('/catalog', input);
  },

  update(id: string, input: UpdateCatalogComponentInput): Promise<CatalogItem> {
    return http.put<CatalogItem>(`/catalog/${id}`, input);
  },

  remove(id: string): Promise<void> {
    return http.delete<void>(`/catalog/${id}`);
  },
};
