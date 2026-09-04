/**
 * Unit tests for HandlePaymentEvent use case.
 */
import { CreateOrder } from '../../src/useCases/CreateOrder';
import { HandlePaymentEvent } from '../../src/useCases/HandlePaymentEvent';
import { PaymentEvent } from '../../src/domain/entities/PaymentEvent';
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
  deliveryNotes: 'Citofono Rossi',
};

function buildEvent(orderId: string, overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    eventId: 'evt_1',
    type: 'PAYMENT_COMPLETED',
    occurredAt: new Date().toISOString(),
    paymentId: 'pay_1',
    orderId,
    ...overrides,
  };
}

describe('HandlePaymentEvent', () => {
  it('forwards an AWAITING_PAYMENT order to SUBMITTED on PAYMENT_COMPLETED', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const handlePaymentEvent = new HandlePaymentEvent(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });
    expect(created.status).toBe('AWAITING_PAYMENT');

    await handlePaymentEvent.execute(buildEvent(created.id, { type: 'PAYMENT_COMPLETED' }));

    const order = await repo.findById(created.id);
    expect(order?.status).toBe('SUBMITTED');
  });

  it('cancels an AWAITING_PAYMENT order on PAYMENT_FAILED', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const handlePaymentEvent = new HandlePaymentEvent(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    await handlePaymentEvent.execute(buildEvent(created.id, { type: 'PAYMENT_FAILED', failureReason: 'card declined' }));

    const order = await repo.findById(created.id);
    expect(order?.status).toBe('CANCELLED');
    expect(order?.cancelledAt).toBeInstanceOf(Date);
  });

  it('is a no-op when the order is not AWAITING_PAYMENT (idempotent against redelivery)', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const handlePaymentEvent = new HandlePaymentEvent(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    await handlePaymentEvent.execute(buildEvent(created.id, { type: 'PAYMENT_COMPLETED' }));
    await handlePaymentEvent.execute(buildEvent(created.id, { type: 'PAYMENT_FAILED' }));

    const order = await repo.findById(created.id);
    expect(order?.status).toBe('SUBMITTED');
  });

  it('is a no-op when the order does not exist', async () => {
    const repo = new FakeOrderRepository();
    const handlePaymentEvent = new HandlePaymentEvent(repo);

    await expect(handlePaymentEvent.execute(buildEvent('missing'))).resolves.toBeUndefined();
  });
});
