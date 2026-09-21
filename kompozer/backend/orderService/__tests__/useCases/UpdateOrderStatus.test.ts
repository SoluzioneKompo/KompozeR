/**
 * Unit tests for UpdateOrderStatus use case.
 */
import { CreateOrder } from '../../src/useCases/CreateOrder';
import { UpdateOrderStatus } from '../../src/useCases/UpdateOrderStatus';
import {
  OrderAlreadyCancelledError,
  OrderAlreadyDoneError,
  OrderStatusTransitionNotAllowedError,
} from '../../src/domain/entities/errors';
import { FakeOrderRepository } from '../helpers/fakes';

/** Simulates a completed payment, moving an order past AWAITING_PAYMENT. */
async function forwardOrder(repo: FakeOrderRepository, orderId: string): Promise<void> {
  const order = await repo.findById(orderId);
  if (!order) throw new Error('Order not found in fake repository');
  await repo.update({ ...order, status: 'SUBMITTED' });
}

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

describe('UpdateOrderStatus', () => {
  it('transitions order from SUBMITTED to DONE', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const updateOrderStatus = new UpdateOrderStatus(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });
    await forwardOrder(repo, created.id);

    const updated = await updateOrderStatus.execute({
      orderId: created.id,
      status: 'DONE',
    });

    expect(updated.status).toBe('DONE');
    expect(updated.doneAt).toEqual(expect.any(String));
  });

  it('throws when order is still AWAITING_PAYMENT', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const updateOrderStatus = new UpdateOrderStatus(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    await expect(
      updateOrderStatus.execute({ orderId: created.id, status: 'DONE' }),
    ).rejects.toBeInstanceOf(OrderStatusTransitionNotAllowedError);
  });

  it('throws when order is already DONE', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const updateOrderStatus = new UpdateOrderStatus(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });
    await forwardOrder(repo, created.id);

    await updateOrderStatus.execute({ orderId: created.id, status: 'DONE' });

    await expect(
      updateOrderStatus.execute({ orderId: created.id, status: 'DONE' }),
    ).rejects.toBeInstanceOf(OrderAlreadyDoneError);
  });

  it('throws when order is CANCELLED', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const updateOrderStatus = new UpdateOrderStatus(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    const order = await repo.findById(created.id);
    if (!order) throw new Error('Order not found in fake repository');

    await repo.update({
      ...order,
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });

    await expect(
      updateOrderStatus.execute({ orderId: created.id, status: 'DONE' }),
    ).rejects.toBeInstanceOf(OrderAlreadyCancelledError);
  });
});
