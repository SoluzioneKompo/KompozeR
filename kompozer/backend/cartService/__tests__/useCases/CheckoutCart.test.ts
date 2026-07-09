/**
 * Unit tests for CheckoutCart use case.
 */
import { CheckoutCart } from '../../src/useCases/CheckoutCart';
import {
  CartEmptyError,
  CartItemUnavailableError,
} from '../../src/domain/entities/errors';
import { UpsertCartItem } from '../../src/useCases/UpsertCartItem';
import {
  FakeCartEventPublisher,
  FakeCartRepository,
  FakeCatalogSnapshotProvider,
  FakeOrderServiceClient,
} from '../helpers/fakes';

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

describe('CheckoutCart', () => {
  it('confirms checkout when catalog snapshot matches cart', async () => {
    const repo = new FakeCartRepository();
    const catalog = new FakeCatalogSnapshotProvider();
    const orderClient = new FakeOrderServiceClient();
    const publisher = new FakeCartEventPublisher();
    const upsert = new UpsertCartItem(repo, publisher);
    const checkout = new CheckoutCart(repo, catalog, orderClient, publisher);

    await upsert.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 2,
    });

    catalog.set({ sku: 'SKU-001', unitPrice: 1990, isAvailable: true });

    const result = await checkout.execute({ userId: 'usr_1', expeditionInfo });
    expect(result.status).toBe('SUBMITTED');
    expect(result.orderId).toBe('ord_1');
    expect(result.total).toBe(3980);
    expect(orderClient.calls).toHaveLength(1);
    expect(publisher.events.map((event) => event.type)).toContain('OrderRequestSubmitted');
    expect(publisher.events.map((event) => event.type)).toContain('OrderConfirmationRequested');

    const cartAfterCheckout = await repo.findByUserId('usr_1');
    expect(cartAfterCheckout).not.toBeNull();
    expect(cartAfterCheckout?.items).toHaveLength(0);
    expect(cartAfterCheckout?.total).toBe(0);
  });

  it('throws CartEmptyError when cart has no items', async () => {
    const repo = new FakeCartRepository();
    const catalog = new FakeCatalogSnapshotProvider();
    const orderClient = new FakeOrderServiceClient();
    const checkout = new CheckoutCart(repo, catalog, orderClient);

    await expect(checkout.execute({ userId: 'usr_1', expeditionInfo })).rejects.toBeInstanceOf(
      CartEmptyError,
    );
  });

  it('throws CartItemUnavailableError when item is unavailable', async () => {
    const repo = new FakeCartRepository();
    const catalog = new FakeCatalogSnapshotProvider();
    const orderClient = new FakeOrderServiceClient();
    const upsert = new UpsertCartItem(repo);
    const checkout = new CheckoutCart(repo, catalog, orderClient);

    await upsert.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 1,
    });

    catalog.set({ sku: 'SKU-001', unitPrice: 1990, isAvailable: false });

    await expect(checkout.execute({ userId: 'usr_1', expeditionInfo })).rejects.toBeInstanceOf(
      CartItemUnavailableError,
    );
  });

  it('auto-updates price at checkout when catalog price changed and proceeds to order', async () => {
    const repo = new FakeCartRepository();
    const catalog = new FakeCatalogSnapshotProvider();
    const orderClient = new FakeOrderServiceClient();
    const upsert = new UpsertCartItem(repo);
    const checkout = new CheckoutCart(repo, catalog, orderClient);

    await upsert.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 1,
    });

    catalog.set({ sku: 'SKU-001', unitPrice: 2090, isAvailable: true });

    const result = await checkout.execute({ userId: 'usr_1', expeditionInfo });
    expect(result.status).toBe('SUBMITTED');
    expect(result.total).toBe(2090);
    expect(orderClient.calls[0].items[0].unitPrice).toBe(2090);
  });

  it('accepts checkout when deliveryNotes is omitted', async () => {
    const repo = new FakeCartRepository();
    const catalog = new FakeCatalogSnapshotProvider();
    const orderClient = new FakeOrderServiceClient();
    const upsert = new UpsertCartItem(repo);
    const checkout = new CheckoutCart(repo, catalog, orderClient);

    await upsert.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 1,
    });

    catalog.set({ sku: 'SKU-001', unitPrice: 1990, isAvailable: true });

    const { deliveryNotes: _deliveryNotes, ...withoutNotes } = expeditionInfo;
    const result = await checkout.execute({ userId: 'usr_1', expeditionInfo: withoutNotes });

    expect(result.status).toBe('SUBMITTED');
  });
});
