/** Cart API client for cart mutation, retrieval, and checkout operations. */
import { http } from './httpClient';
import type { Cart, CheckoutResult, ExpeditionInfo } from '@/types/cart';

export const cartService = {
  get(): Promise<Cart> {
    return http.get<Cart>('/cart');
  },

  addItem(sku: string, data: { name: string; unitPrice: number; quantity: number }): Promise<Cart> {
    return http.put<Cart>(`/cart/items/${sku}`, data);
  },

  removeItem(sku: string): Promise<Cart> {
    return http.delete<Cart>(`/cart/items/${sku}`);
  },

  clear(): Promise<void> {
    return http.delete<void>('/cart');
  },

  checkout(expeditionInfo: ExpeditionInfo): Promise<CheckoutResult> {
    return http.post<CheckoutResult>('/cart/checkout', { expeditionInfo });
  },
};
