/**
 * Domain port for payment persistence.
 */
import { Payment } from '../entities/Payment';

export interface PaymentRepository {
  create(payment: Payment): Promise<void>;
  findById(paymentId: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  listByUserId(userId: string): Promise<Payment[]>;
  update(payment: Payment): Promise<void>;
}
