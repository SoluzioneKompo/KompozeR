/**
 * Core order domain model.
 */
export type OrderStatus = 'AWAITING_PAYMENT' | 'SUBMITTED' | 'DONE' | 'CANCELLED';

export interface OrderItem {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
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

export interface Order {
  id: string;
  userId: string;
  expeditionInfo: ExpeditionInfo;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  submittedAt: Date;
  doneAt?: Date;
  cancelledAt?: Date;
}
