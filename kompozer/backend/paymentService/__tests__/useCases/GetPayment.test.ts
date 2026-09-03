import { CreatePayment } from '../../src/useCases/CreatePayment';
import { GetPayment } from '../../src/useCases/GetPayment';
import { ForbiddenError, PaymentNotFoundError } from '../../src/domain/entities/errors';
import { FakePaymentGatewayFactory, FakePaymentRepository } from '../helpers/fakes';

function build() {
  const repo = new FakePaymentRepository();
  const createPayment = new CreatePayment(repo, new FakePaymentGatewayFactory());
  return { repo, createPayment, useCase: new GetPayment(repo) };
}

describe('GetPayment', () => {
  it('returns the payment for its owner', async () => {
    const { useCase, createPayment } = build();
    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'CARD',
      amount: 1990,
      currency: 'EUR',
    });

    const result = await useCase.execute({ userId: 'usr_1', paymentId: created.id });
    expect(result.id).toBe(created.id);
  });

  it('throws PaymentNotFoundError for an unknown id', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ userId: 'usr_1', paymentId: 'missing' })).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });

  it('throws ForbiddenError for another user payment', async () => {
    const { useCase, createPayment } = build();
    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'CARD',
      amount: 1990,
      currency: 'EUR',
    });

    await expect(useCase.execute({ userId: 'usr_2', paymentId: created.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
