/**
 * Use case for retrieving a single payment owned by the requesting user.
 */
import { ForbiddenError, PaymentNotFoundError, ValidationError } from '../domain/entities/errors';
import { PaymentRepository } from '../domain/ports/PaymentRepository';
import { GetPaymentInput, PaymentDto, toPaymentDto } from './types';

export class GetPayment {
  constructor(private readonly repo: PaymentRepository) {}

  async execute(input: GetPaymentInput): Promise<PaymentDto> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.paymentId?.trim()) {
      throw new ValidationError('paymentId is required');
    }

    const payment = await this.repo.findById(input.paymentId);
    if (!payment) {
      throw new PaymentNotFoundError(input.paymentId);
    }
    if (payment.userId !== input.userId) {
      throw new ForbiddenError('Cannot access another user payment');
    }

    return toPaymentDto(payment);
  }
}
