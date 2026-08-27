/**
 * HTTP-level test coverage for cart router endpoints.
 */
import express from 'express';
import request from 'supertest';
import { buildCartRouter } from '../../src/adapters/http/cartRouter';
import { errorMiddleware } from '../../src/adapters/http/errorMiddleware';
import { GetCart } from '../../src/useCases/GetCart';
import { UpsertCartItem } from '../../src/useCases/UpsertCartItem';
import { RemoveCartItem } from '../../src/useCases/RemoveCartItem';
import { ClearCart } from '../../src/useCases/ClearCart';
import { CheckoutCart } from '../../src/useCases/CheckoutCart';
import { FakeCartRepository, FakeCatalogSnapshotProvider, FakeOrderServiceClient } from '../helpers/fakes';

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

function buildTestApp() {
  const repo = new FakeCartRepository();
  const catalog = new FakeCatalogSnapshotProvider();
  const orderClient = new FakeOrderServiceClient();

  const app = express();
  app.use(express.json());
  app.use(
    '/cart',
    buildCartRouter({
      getCart: new GetCart(repo),
      upsertCartItem: new UpsertCartItem(repo),
      removeCartItem: new RemoveCartItem(repo),
      clearCart: new ClearCart(repo),
      checkoutCart: new CheckoutCart(repo, catalog, orderClient),
    }),
  );
  app.use(errorMiddleware);

  return { app, catalog };
}

describe('cartRouter', () => {
  it('GET /cart/health -> 200', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/cart/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /cart -> 401 when identity is missing', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/cart');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('PUT /cart/items/:sku adds item and GET /cart returns it', async () => {
    const { app } = buildTestApp();

    const upsert = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 2 });

    expect(upsert.status).toBe(200);
    expect(upsert.body.total).toBe(3980);

    const get = await request(app).get('/cart').set('x-user-id', 'usr_1');
    expect(get.status).toBe(200);
    expect(get.body.items).toHaveLength(1);
  });

  it('PUT /cart/items/:sku is idempotent on same SKU (single row, stable total)', async () => {
    const { app } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 2 });

    const second = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 2 });

    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.total).toBe(3980);
  });

  it('PUT /cart/items/:sku -> 422 on invalid quantity', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 0 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /cart/items/:sku -> 422 on invalid unitPrice', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: -1, quantity: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /cart/items/:sku -> 422 when name has the wrong type instead of being stored as-is', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: { nested: 'object' }, unitPrice: 1990, quantity: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /cart/items/:sku -> 422 on unknown/extra fields', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 1, discount: 999 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /cart/items/:sku -> 422 on a sku that is too long / has invalid characters', async () => {
    const { app } = buildTestApp();
    const longSku = 'a'.repeat(100);

    const res = await request(app)
      .put(`/cart/items/${longSku}`)
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /cart/checkout -> 422 when expeditionInfo field has the wrong type', async () => {
    const { app } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 1 });

    const res = await request(app)
      .post('/cart/checkout')
      .set('x-user-id', 'usr_1')
      .send({ expeditionInfo: { ...expeditionInfo, mail: 12345 } });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /cart/items/:sku -> 400 on syntactically invalid JSON', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('DELETE /cart/items/:sku removes item', async () => {
    const { app } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 2 });

    const del = await request(app)
      .delete('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1');

    expect(del.status).toBe(200);
    expect(del.body.items).toHaveLength(0);
    expect(del.body.total).toBe(0);
  });

  it('DELETE /cart clears entire cart', async () => {
    const { app } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 2 });

    const clear = await request(app).delete('/cart').set('x-user-id', 'usr_1');
    expect(clear.status).toBe(204);

    const get = await request(app).get('/cart').set('x-user-id', 'usr_1');
    expect(get.status).toBe(200);
    expect(get.body.items).toHaveLength(0);
  });

  it('POST /cart/checkout -> 409 when cart is empty', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/cart/checkout')
      .set('x-user-id', 'usr_1')
      .send({ expeditionInfo });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });

  it('POST /cart/checkout -> 200 when catalog snapshot is consistent', async () => {
    const { app, catalog } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 1 });

    catalog.set({ sku: 'SKU-001', unitPrice: 1990, isAvailable: true });

    const res = await request(app)
      .post('/cart/checkout')
      .set('x-user-id', 'usr_1')
      .send({ expeditionInfo });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.orderId).toBe('ord_1');

    const cartAfterCheckout = await request(app).get('/cart').set('x-user-id', 'usr_1');
    expect(cartAfterCheckout.status).toBe(200);
    expect(cartAfterCheckout.body.items).toHaveLength(0);
    expect(cartAfterCheckout.body.total).toBe(0);
  });

  it('POST /cart/checkout -> 409 when item becomes unavailable', async () => {
    const { app, catalog } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 1 });

    catalog.set({ sku: 'SKU-001', unitPrice: 1990, isAvailable: false });

    const res = await request(app)
      .post('/cart/checkout')
      .set('x-user-id', 'usr_1')
      .send({ expeditionInfo });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');
  });

  it('POST /cart/checkout -> 200 with updated price when catalog price changed (auto-sync)', async () => {
    const { app, catalog } = buildTestApp();

    await request(app)
      .put('/cart/items/SKU-001')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Ripiano', unitPrice: 1990, quantity: 1 });

    catalog.set({ sku: 'SKU-001', unitPrice: 2090, isAvailable: true });

    const res = await request(app)
      .post('/cart/checkout')
      .set('x-user-id', 'usr_1')
      .send({ expeditionInfo });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.total).toBe(2090);
  });
});
