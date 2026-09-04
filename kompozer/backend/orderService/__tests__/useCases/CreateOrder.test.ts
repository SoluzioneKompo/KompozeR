/**
 * Unit tests for CreateOrder use case.
 */
import { CreateOrder } from '../../src/useCases/CreateOrder';
import { ValidationError } from '../../src/domain/entities/errors';
import { FakeOrderRepository } from '../helpers/fakes';

describe('CreateOrder', () => {
  it('creates an order in AWAITING_PAYMENT status', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);

    const result = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo: {
        name: 'Mario',
        surname: 'Rossi',
        mail: 'mario.rossi@example.com',
        nation: 'Italia',
        city: 'Milano',
        cap: '20100',
        address: 'Via Roma 10',
        phone: '+390212345678',
        deliveryNotes: 'Citofono Rossi',
      },
      items: [
        {
          sku: 'SKU-001',
          name: 'Ripiano',
          unitPrice: 1990,
          quantity: 2,
        },
      ],
      total: 3980,
    });

    expect(result.id).toEqual(expect.any(String));
    expect(result.status).toBe('AWAITING_PAYMENT');
    expect(result.total).toBe(3980);
  });

  it('throws for empty items', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);

    await expect(
      createOrder.execute({
        userId: 'usr_1',
        expeditionInfo: {
          name: 'Mario',
          surname: 'Rossi',
          mail: 'mario.rossi@example.com',
          nation: 'Italia',
          city: 'Milano',
          cap: '20100',
          address: 'Via Roma 10',
          phone: '+390212345678',
          deliveryNotes: 'Citofono Rossi',
        },
        items: [],
        total: 1000,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates an order when deliveryNotes is omitted', async () => {
    const repo = new FakeOrderRepository();
    const createOrder = new CreateOrder(repo);

    const result = await createOrder.execute({
      userId: 'usr_1',
      expeditionInfo: {
        name: 'Mario',
        surname: 'Rossi',
        mail: 'mario.rossi@example.com',
        nation: 'Italia',
        city: 'Milano',
        cap: '20100',
        address: 'Via Roma 10',
        phone: '+390212345678',
      },
      items: [
        {
          sku: 'SKU-001',
          name: 'Ripiano',
          unitPrice: 1990,
          quantity: 2,
        },
      ],
      total: 3980,
    });

    expect(result.status).toBe('AWAITING_PAYMENT');
    expect(result.expeditionInfo.deliveryNotes).toBeUndefined();
  });
});
