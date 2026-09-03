import { CreatePayment } from '../../src/useCases/CreatePayment';
import { ValidationError } from '../../src/domain/entities/errors';
import { FakePaymentGatewayFactory, FakePaymentRepository } from '../helpers/fakes';

function build() {
  const repo = new FakePaymentRepository();
  const gatewayFactory = new FakePaymentGatewayFactory();
  return { repo, gatewayFactory, useCase: new CreatePayment(repo, gatewayFactory) };
}

describe('CreatePayment', () => {
  it('creates a PENDING payment with a provider reference from the gateway', async () => {
    const { useCase, repo } = build();

    const result = await useCase.execute({
      userId: 'usr_1',
      orderId: 'order_1',
      method: 'PAYPAL',
      amount: 1990,
      currency: 'EUR',
    });

    expect(result.status).toBe('PENDING');
    expect(result.providerReference).toBe('fake-reference');
    expect(await repo.findById(result.id)).not.toBeNull();
  });

  it('rejects an unknown method', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({
        userId: 'usr_1',
        orderId: 'order_1',
        // @ts-expect-error invalid method on purpose
        method: 'BITCOIN',
        amount: 1990,
        currency: 'EUR',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-positive amount', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({
        userId: 'usr_1',
        orderId: 'order_1',
        method: 'CARD',
        amount: 0,
        currency: 'EUR',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an invalid currency code', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({
        userId: 'usr_1',
        orderId: 'order_1',
        method: 'CARD',
        amount: 1990,
        currency: 'eur',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
