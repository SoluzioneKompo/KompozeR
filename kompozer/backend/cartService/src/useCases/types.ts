/**
 * Input/output contracts for cartService use cases.
 */
import { CartItem } from '../domain/entities/Cart';

export interface GetCartInput {
  userId: string;
}

export interface GetCartOutput {
  userId: string;
  items: CartItem[];
  total: number;
  updatedAt: Date;
}

export interface UpsertCartItemInput {
  userId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface RemoveCartItemInput {
  userId: string;
  sku: string;
}

export interface ClearCartInput {
  userId: string;
}

export interface SyncCartInput {
  userId: string;
}

export interface ExpeditionInfo {
  name: string;
  surname: string;
  mail: string;
  nation: string;
  city: string;
  cap: string;
  address: string;
  phone: string;
  deliveryNotes?: string;
}

export interface CheckoutCartInput {
  userId: string;
  expeditionInfo: ExpeditionInfo;
}

export interface CheckoutCartOutput {
  orderId: string;
  status: 'SUBMITTED';
  userId: string;
  items: CartItem[];
  total: number;
  submittedAt: Date;
}
