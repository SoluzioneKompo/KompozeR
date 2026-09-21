/**
 * Unit tests for GetOrder use case, focused on the lazy abandoned-order
 * expiry path (see expireAbandonedOrder.ts) — ownership/validation checks
 * are exercised at the HTTP layer in orderRouter.test.ts.
 */
import { GetOrder } from '../../src/useCases/GetOrder';
import { AWAITING_PAYMENT_TIMEOUT_MS } from '../../src/useCases/expireAbandonedOrder';
import { Order } from '../../src/domain/entities/Order';
import { FakeOrderRepository } from '../helpers/fakes';

const expeditionInfo = {
  name: 'Mario',
  surname: 'Rossi',
  mail: 'mario.rossi@example.com',
  nation: 'Italia',
  city: 'Milano',
  cap: '20100',
  address: 'Via Roma 10',
  phone: '+390212345678',
};

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord_1',
    userId: 'usr_1',
    expeditionInfo,
    items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
    total: 1990,
    status: 'AWAITING_PAYMENT',
    submittedAt: new Date(),
    ...overrides,
  };
}

describe('GetOrder — abandoned order expiry', () => {
  it('returns CANCELLED and persists it when the order has sat AWAITING_PAYMENT past the timeout', async () => {
    const repo = new FakeOrderRepository();
    await repo.create(
      buildOrder({ submittedAt: new Date(Date.now() - AWAITING_PAYMENT_TIMEOUT_MS - 1000) }),
    );
    const getOrder = new GetOrder(repo);

    const result = await getOrder.execute({ userId: 'usr_1', orderId: 'ord_1' });

    expect(result.status).toBe('CANCELLED');
    const persisted = await repo.findById('ord_1');
    expect(persisted?.status).toBe('CANCELLED');
  });

  it('returns AWAITING_PAYMENT unchanged when still inside the timeout window', async () => {
    const repo = new FakeOrderRepository();
    await repo.create(buildOrder({ submittedAt: new Date() }));
    const getOrder = new GetOrder(repo);

    const result = await getOrder.execute({ userId: 'usr_1', orderId: 'ord_1' });

    expect(result.status).toBe('AWAITING_PAYMENT');
  });
});
