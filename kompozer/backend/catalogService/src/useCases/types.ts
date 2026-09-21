/**
 * Input/output DTOs for all catalogService use cases.
 *
 * Output DTOs never expose domain entities directly:
 * they separate HTTP contract from internal model,
 * allow independent evolution, and keep returned fields explicit.
 */
import { ComponentCategory } from '../domain/entities/ComponentCategory';
import { ComponentType }     from '../domain/entities/ComponentType';

// Output DTO

export interface DimensionsDto {
  widthMm:  number;
  heightMm: number;
  depthMm:  number;
}

// Full component representation used by GetComponent and CreateComponent.
export interface ComponentDto {
  id:             string;
  sku:            string;
  name:           string;
  description:    string;
  category:       ComponentCategory;
  Type:           ComponentType;
  price:          number;
  isAvailable:    boolean;
  imageUrl:       string;
  dimensions:     DimensionsDto;
  compatibleWith: string[];
  version:        number;
  createdAt:      string; // ISO 8601
  updatedAt:      string; // ISO 8601
}

// Paginated response used by ListComponents.
export interface PaginatedComponentsDto {
  items:      ComponentDto[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

// Input DTO

export interface ListComponentsInput {
  category?:  ComponentCategory;
  minPrice?:  number;
  maxPrice?:  number;
  available?: boolean;
  search?:    string;
  page?:      number;
  limit?:     number;
}

export interface GetComponentInput {
  id: string;
}

export interface CreateComponentInput {
  name:           string;
  description:    string;
  category:       ComponentCategory;
  Type:           ComponentType;
  price:          number;
  isAvailable:    boolean;
  imageUrl:       string;
  dimensions:     DimensionsDto;
  compatibleWith: string[];
  requestingUserId: string; // X-User-Id injected by gateway
}

export interface UpdateComponentInput {
  id:              string;
  expectedVersion: number;         // [DS] optimistic concurrency: client expected version
  name?:           string;
  description?:    string;
  price?:          number;
  isAvailable?:    boolean;
  imageUrl?:       string;
  dimensions?:     DimensionsDto;
  compatibleWith?: string[];
  requestingUserId: string;        // [DS] tracked in published event
}

export interface DeleteComponentInput {
  id: string;
}
