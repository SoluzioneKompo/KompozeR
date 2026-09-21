/**
 * Input/output contracts for paymentService use cases.
 */
import { Payment, PaymentMethod, PaymentStatus } from '../domain/entities/Payment';

export interface PaymentDto {
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

export interface CreatePaymentInput {
  orderId: string;
  userId: string;
  method: PaymentMethod;
  amount: number;
  currency: string;
}

export interface GetPaymentInput {
  userId: string;
  paymentId: string;
}

export interface GetPaymentByOrderInput {
  userId: string;
  orderId: string;
}

export interface ConfirmPaymentInput {
  paymentId: string;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
}

export function toPaymentDto(payment: Payment): PaymentDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    userId: payment.userId,
    method: payment.method,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    providerReference: payment.providerReference,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    completedAt: payment.completedAt?.toISOString(),
  };
}
