/**
 * Unit tests for GetPaymentByOrder, focused on the retry scenario: after a
 * failed attempt, CreatePayment adds a new Payment doc for the same order
 * (see CreatePayment) rather than reusing the old one, so this must surface
 * the latest attempt, not just any match.
 */
import { GetPaymentByOrder } from '../../src/useCases/GetPaymentByOrder';
import { ForbiddenError, PaymentNotFoundError } from '../../src/domain/entities/errors';
import { Payment } from '../../src/domain/entities/Payment';
import { FakePaymentRepository } from '../helpers/fakes';

function buildPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_1',
    orderId: 'order_1',
    userId: 'usr_1',
    method: 'CARD',
    amount: 1990,
    currency: 'EUR',
    status: 'PENDING',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GetPaymentByOrder', () => {
  it('returns the most recent payment attempt for an order with a retry history', async () => {
    const repo = new FakePaymentRepository();
    await repo.create(
      buildPayment({ id: 'pay_failed', status: 'FAILED', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
    );
    await repo.create(
      buildPayment({ id: 'pay_retry', status: 'PENDING', createdAt: new Date('2026-01-01T00:05:00.000Z') }),
    );
    const useCase = new GetPaymentByOrder(repo);

    const result = await useCase.execute({ userId: 'usr_1', orderId: 'order_1' });

    expect(result.id).toBe('pay_retry');
    expect(result.status).toBe('PENDING');
  });

  it('throws PaymentNotFoundError when the order has no payment', async () => {
    const repo = new FakePaymentRepository();
    const useCase = new GetPaymentByOrder(repo);

    await expect(useCase.execute({ userId: 'usr_1', orderId: 'order_1' })).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });

  it('throws ForbiddenError when the payment belongs to another user', async () => {
    const repo = new FakePaymentRepository();
    await repo.create(buildPayment({ userId: 'usr_owner' }));
    const useCase = new GetPaymentByOrder(repo);

    await expect(useCase.execute({ userId: 'usr_other', orderId: 'order_1' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
