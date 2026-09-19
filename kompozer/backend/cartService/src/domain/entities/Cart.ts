/**
 * Core cart domain model and total computation helpers.
 */
export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface RemovedUnavailableItemSnapshot {
  sku: string;
  name: string;
  quantity: number;
  removedAt: Date;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  removedUnavailableItems?: Record<string, RemovedUnavailableItemSnapshot>;
  total: number;
  updatedAt: Date;
  /** Id/name of the single CAD configuration this cart's items were pushed from, if any. */
  configId?: string;
  configName?: string;
}

export function computeLineTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

export function computeCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}
