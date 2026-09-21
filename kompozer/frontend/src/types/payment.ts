/** Payment domain contracts used by the payment service, store, and views. */
export type PaymentMethod = 'PAYPAL' | 'CARD';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  method: PaymentMethod;
  amount: number;
  currency: string;
  status: PaymentStatus;
  providerReference?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}
