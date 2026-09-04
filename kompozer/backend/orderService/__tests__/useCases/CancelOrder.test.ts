/**
 * Unit tests for CancelOrder use case.
 */
import { CancelOrder } from '../../src/useCases/CancelOrder';
import { CreateOrder } from '../../src/useCases/CreateOrder';
import {
  ForbiddenError,
  OrderAlreadyCancelledError,
  OrderAlreadyDoneError,
} from '../../src/domain/entities/errors';
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

describe('CancelOrder', () => {
  it('allows owner to cancel own AWAITING_PAYMENT order', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const cancelOrder = new CancelOrder(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    const cancelled = await cancelOrder.execute({
      userId: 'usr_1',
      orderId: created.id,
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).toEqual(expect.any(String));
  });

  it('rejects non-admin when cancelling another user order', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const cancelOrder = new CancelOrder(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    await expect(
      cancelOrder.execute({
        userId: 'usr_2',
        orderId: created.id,
        role: 'BASE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows admin to cancel another user order', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const cancelOrder = new CancelOrder(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    const cancelled = await cancelOrder.execute({
      userId: 'adm_1',
      orderId: created.id,
      role: 'ADMIN',
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).toEqual(expect.any(String));
  });

  it('throws when order is already CANCELLED', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const cancelOrder = new CancelOrder(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    await cancelOrder.execute({ userId: 'usr_1', orderId: created.id });

    await expect(
      cancelOrder.execute({ userId: 'usr_1', orderId: created.id }),
    ).rejects.toBeInstanceOf(OrderAlreadyCancelledError);
  });

  it('throws when order is DONE', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);
    const cancelOrder = new CancelOrder(repo);

    const created = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo,
      items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
      total: 1990,
    });

    const order = await repo.findById(created.id);
    if (!order) {
      throw new Error('Order not found in fake repository');
    }

    await repo.update({
      ...order,
      status: 'DONE',
      doneAt: new Date(),
    });

    await expect(
      cancelOrder.execute({ userId: 'usr_1', orderId: created.id }),
    ).rejects.toBeInstanceOf(OrderAlreadyDoneError);
  });
});