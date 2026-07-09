/** Cart domain contracts used by cart services, store, and views. */
export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  total: number;
  updatedAt: string;
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

export interface CheckoutResult {
  orderId: string;
  status: 'SUBMITTED';
  userId: string;
  items: CartItem[];
  total: number;
  submittedAt: string;
}
