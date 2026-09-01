/**
 * Use case for retrieving the payment attached to an order, used by the
 * payment page to poll status right after checkout.
 */
import { ForbiddenError, PaymentNotFoundError, ValidationError } from '../domain/entities/errors';
import { PaymentRepository } from '../domain/ports/PaymentRepository';
import { GetPaymentByOrderInput, PaymentDto, toPaymentDto } from './types';

export class GetPaymentByOrder {
  constructor(private readonly repo: PaymentRepository) {}

  async execute(input: GetPaymentByOrderInput): Promise<PaymentDto> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.orderId?.trim()) {
      throw new ValidationError('orderId is required');
    }

    const payment = await this.repo.findByOrderId(input.orderId);
    if (!payment) {
      throw new PaymentNotFoundError(input.orderId);
    }
    if (payment.userId !== input.userId) {
      throw new ForbiddenError('Cannot access another user payment');
    }

    return toPaymentDto(payment);
  }
}
