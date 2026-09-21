/**
 * Unit tests for the lazy AWAITING_PAYMENT expiry helper.
 */
import { AWAITING_PAYMENT_TIMEOUT_MS, expireIfAbandoned, isOrderAbandoned } from '../../src/useCases/expireAbandonedOrder';
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
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('isOrderAbandoned', () => {
  it('is false for an AWAITING_PAYMENT order still inside the timeout window', () => {
    const order = buildOrder();
    const now = new Date(order.submittedAt.getTime() + AWAITING_PAYMENT_TIMEOUT_MS - 1);
    expect(isOrderAbandoned(order, now)).toBe(false);
  });

  it('is true for an AWAITING_PAYMENT order past the timeout window', () => {
    const order = buildOrder();
    const now = new Date(order.submittedAt.getTime() + AWAITING_PAYMENT_TIMEOUT_MS + 1);
    expect(isOrderAbandoned(order, now)).toBe(true);
  });

  it('is false for a non AWAITING_PAYMENT order, no matter how old', () => {
    const order = buildOrder({ status: 'SUBMITTED' });
    const now = new Date(order.submittedAt.getTime() + AWAITING_PAYMENT_TIMEOUT_MS + 1);
    expect(isOrderAbandoned(order, now)).toBe(false);
  });
});

describe('expireIfAbandoned', () => {
  it('cancels and persists an abandoned order', async () => {
    const repo = new FakeOrderRepository();
    const order = buildOrder();
    await repo.create(order);
    const now = new Date(order.submittedAt.getTime() + AWAITING_PAYMENT_TIMEOUT_MS + 1);

    const result = await expireIfAbandoned(order, repo, now);

    expect(result.status).toBe('CANCELLED');
    expect(result.cancelledAt).toEqual(now);

    const persisted = await repo.findById(order.id);
    expect(persisted?.status).toBe('CANCELLED');
  });

  it('leaves a still-fresh AWAITING_PAYMENT order untouched', async () => {
    const repo = new FakeOrderRepository();
    const order = buildOrder();
    await repo.create(order);
    const now = new Date(order.submittedAt.getTime() + 1000);

    const result = await expireIfAbandoned(order, repo, now);

    expect(result.status).toBe('AWAITING_PAYMENT');
    const persisted = await repo.findById(order.id);
    expect(persisted?.status).toBe('AWAITING_PAYMENT');
  });
});
