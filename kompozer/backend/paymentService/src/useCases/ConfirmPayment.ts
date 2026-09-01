/**
 * Use case simulating the provider callback/webhook that finalizes a payment.
 * Stands in for PayPal/card confirmation until real webhooks are wired up.
 */
import {
  PaymentAlreadyFinalizedError,
  PaymentNotFoundError,
  ValidationError,
} from '../domain/entities/errors';
import { PaymentRepository } from '../domain/ports/PaymentRepository';
import { ConfirmPaymentInput, PaymentDto, toPaymentDto } from './types';

export class ConfirmPayment {
  constructor(private readonly repo: PaymentRepository) {}

  async execute(input: ConfirmPaymentInput): Promise<PaymentDto> {
    if (!input.paymentId?.trim()) {
      throw new ValidationError('paymentId is required');
    }
    if (input.status !== 'COMPLETED' && input.status !== 'FAILED') {
      throw new ValidationError('status must be COMPLETED or FAILED');
    }

    const payment = await this.repo.findById(input.paymentId);
    if (!payment) {
      throw new PaymentNotFoundError(input.paymentId);
    }
    if (payment.status !== 'PENDING') {
      throw new PaymentAlreadyFinalizedError(input.paymentId);
    }

    payment.status = input.status;
    payment.completedAt = new Date();
    if (input.status === 'FAILED' && input.failureReason) {
      payment.failureReason = input.failureReason;
    }

    await this.repo.update(payment);
    return toPaymentDto(payment);
  }
}
