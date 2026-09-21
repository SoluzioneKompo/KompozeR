/**
 * Use case for starting a payment attempt against an order.
 * Persists a PENDING payment, then delegates to the provider gateway
 * (PayPal/card — currently stubs) to obtain a provider reference.
 */
import { randomUUID } from 'crypto';
import { Payment } from '../domain/entities/Payment';
import { ValidationError } from '../domain/entities/errors';
import { PaymentRepository } from '../domain/ports/PaymentRepository';
import { PaymentGatewayResolver } from '../domain/ports/PaymentGateway';
import { CreatePaymentInput, PaymentDto, toPaymentDto } from './types';

const CURRENCY_RE = /^[A-Z]{3}$/;

export class CreatePayment {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly gatewayFactory: PaymentGatewayResolver,
  ) {}

  async execute(input: CreatePaymentInput): Promise<PaymentDto> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.orderId?.trim()) {
      throw new ValidationError('orderId is required');
    }
    if (input.method !== 'PAYPAL' && input.method !== 'CARD') {
      throw new ValidationError('method must be PAYPAL or CARD');
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }
    if (typeof input.currency !== 'string' || !CURRENCY_RE.test(input.currency)) {
      throw new ValidationError('currency must be a 3-letter ISO code');
    }

    const payment: Payment = {
      id: randomUUID(),
      orderId: input.orderId,
      userId: input.userId,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      status: 'PENDING',
      createdAt: new Date(),
    };

    const gateway = this.gatewayFactory.resolve(input.method);
    const result = await gateway.initiate(payment);
    payment.providerReference = result.providerReference;

    await this.repo.create(payment);
    return toPaymentDto(payment);
  }
}
