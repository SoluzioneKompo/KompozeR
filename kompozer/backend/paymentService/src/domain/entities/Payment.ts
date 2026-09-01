/**
 * Core payment domain model.
 * A Payment tracks the checkout attempt for one order; the actual
 * provider integration (PayPal, card processor) lives behind PaymentGateway.
 */
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
  createdAt: Date;
  completedAt?: Date;
}
