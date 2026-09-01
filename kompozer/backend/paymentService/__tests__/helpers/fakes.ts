/**
 * In-memory fake implementations for paymentService tests.
 */
import { Payment, PaymentMethod } from '../../src/domain/entities/Payment';
import { PaymentRepository } from '../../src/domain/ports/PaymentRepository';
import { InitiateResult, PaymentGateway, PaymentGatewayResolver } from '../../src/domain/ports/PaymentGateway';

export class FakePaymentRepository implements PaymentRepository {
  private payments = new Map<string, Payment>();

  async create(payment: Payment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
  }

  async findById(paymentId: string): Promise<Payment | null> {
    const payment = this.payments.get(paymentId);
    return payment ? { ...payment } : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const payment = [...this.payments.values()].find((p) => p.orderId === orderId);
    return payment ? { ...payment } : null;
  }

  async listByUserId(userId: string): Promise<Payment[]> {
    return [...this.payments.values()]
      .filter((payment) => payment.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((payment) => ({ ...payment }));
  }

  async update(payment: Payment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
  }
}

export class FakePaymentGateway implements PaymentGateway {
  async initiate(_payment: Payment): Promise<InitiateResult> {
    return { providerReference: 'fake-reference' };
  }
}

export class FakePaymentGatewayFactory implements PaymentGatewayResolver {
  private readonly gateway = new FakePaymentGateway();

  resolve(_method: PaymentMethod): PaymentGateway {
    return this.gateway;
  }
}
