import { CreatePayment } from '../../src/useCases/CreatePayment';
import { ConfirmPayment } from '../../src/useCases/ConfirmPayment';
import { PaymentAlreadyFinalizedError, PaymentNotFoundError } from '../../src/domain/entities/errors';
import { FakePaymentGatewayFactory, FakePaymentRepository } from '../helpers/fakes';

function build() {
  const repo = new FakePaymentRepository();
  const createPayment = new CreatePayment(repo, new FakePaymentGatewayFactory());
  return { repo, createPayment, useCase: new ConfirmPayment(repo) };
}

describe('ConfirmPayment', () => {
  it('marks a PENDING payment as COMPLETED', async () => {
    const { useCase, createPayment } = build();
    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'PAYPAL',
      amount: 1990,
      currency: 'EUR',
    });

    const result = await useCase.execute({ paymentId: created.id, status: 'COMPLETED' });
    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).toEqual(expect.any(String));
  });

  it('marks a PENDING payment as FAILED with a reason', async () => {
    const { useCase, createPayment } = build();
    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'PAYPAL',
      amount: 1990,
      currency: 'EUR',
    });

    const result = await useCase.execute({
      paymentId: created.id,
      status: 'FAILED',
      failureReason: 'card declined',
    });
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toBe('card declined');
  });

  it('throws PaymentNotFoundError for an unknown id', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ paymentId: 'missing', status: 'COMPLETED' })).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });

  it('throws PaymentAlreadyFinalizedError on a second confirm', async () => {
    const { useCase, createPayment } = build();
    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'PAYPAL',
      amount: 1990,
      currency: 'EUR',
    });

    await useCase.execute({ paymentId: created.id, status: 'COMPLETED' });

    await expect(useCase.execute({ paymentId: created.id, status: 'COMPLETED' })).rejects.toBeInstanceOf(
      PaymentAlreadyFinalizedError,
    );
  });

  it('publishes a PAYMENT_COMPLETED event on success', async () => {
    const repo = new FakePaymentRepository();
    const createPayment = new CreatePayment(repo, new FakePaymentGatewayFactory());
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const useCase = new ConfirmPayment(repo, publisher);

    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'PAYPAL',
      amount: 1990,
      currency: 'EUR',
    });

    await useCase.execute({ paymentId: created.id, status: 'COMPLETED' });

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAYMENT_COMPLETED', paymentId: created.id, orderId: 'order_1' }),
    );
  });

  it('publishes a PAYMENT_FAILED event with the failure reason', async () => {
    const repo = new FakePaymentRepository();
    const createPayment = new CreatePayment(repo, new FakePaymentGatewayFactory());
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const useCase = new ConfirmPayment(repo, publisher);

    const created = await createPayment.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'PAYPAL',
      amount: 1990,
      currency: 'EUR',
    });

    await useCase.execute({ paymentId: created.id, status: 'FAILED', failureReason: 'card declined' });

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYMENT_FAILED',
        paymentId: created.id,
        orderId: 'order_1',
        failureReason: 'card declined',
      }),
    );
  });
});
