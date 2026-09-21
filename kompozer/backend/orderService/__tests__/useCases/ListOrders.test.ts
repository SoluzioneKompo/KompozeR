/**
 * Unit tests for ListOrders use case, focused on the lazy abandoned-order
 * expiry path (see expireAbandonedOrder.ts).
 */
import { ListOrders } from '../../src/useCases/ListOrders';
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

describe('ListOrders — abandoned order expiry', () => {
  it('expires stale AWAITING_PAYMENT orders in the listing and persists the change', async () => {
    const repo = new FakeOrderRepository();
    await repo.create(
      buildOrder({
        id: 'ord_stale',
        submittedAt: new Date(Date.now() - AWAITING_PAYMENT_TIMEOUT_MS - 1000),
      }),
    );
    await repo.create(buildOrder({ id: 'ord_fresh', submittedAt: new Date() }));
    const listOrders = new ListOrders(repo);

    const result = await listOrders.execute({ userId: 'usr_1' });

    const stale = result.items.find((o) => o.id === 'ord_stale');
    const fresh = result.items.find((o) => o.id === 'ord_fresh');
    expect(stale?.status).toBe('CANCELLED');
    expect(fresh?.status).toBe('AWAITING_PAYMENT');

    const persisted = await repo.findById('ord_stale');
    expect(persisted?.status).toBe('CANCELLED');
  });
});
