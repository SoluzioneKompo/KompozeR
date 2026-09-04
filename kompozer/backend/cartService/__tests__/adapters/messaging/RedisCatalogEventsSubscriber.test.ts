/**
 * Unit tests for cartService's RedisCatalogEventsSubscriber ack/no-ack
 * behavior. See orderService's equivalent test for why every scenario
 * scripts xreadgroup/xautoclaim to hang forever after the calls under
 * test, rather than keep resolving: a mock that keeps resolving
 * immediately would spin the read loop and starve the test runner's own
 * timers.
 */
import {
  CATALOG_EVENTS_STREAM,
  RedisCatalogEventsSubscriber,
} from '../../../src/adapters/messaging/subscribers/RedisCatalogEventsSubscriber';
import { RestoreUnavailableItems } from '../../../src/useCases/RestoreUnavailableItems';
import { CatalogEvent } from '../../../src/domain/entities/CatalogEvent';

function neverResolves(): Promise<never> {
  return new Promise(() => {});
}

function buildEvent(overrides: Partial<CatalogEvent> = {}): CatalogEvent {
  return {
    eventId: 'evt_1',
    type: 'AVAILABILITY_CHANGED',
    occurredAt: new Date().toISOString(),
    componentId: 'comp_1',
    sku: 'SKU-001',
    changedBy: 'adm_1',
    oldIsAvailable: false,
    newIsAvailable: true,
    ...overrides,
  } as CatalogEvent;
}

function entry(event: CatalogEvent, id = '1-0'): [string, string[]] {
  return [id, ['payload', JSON.stringify(event)]];
}

function buildFakeRedis() {
  return {
    xgroup: jest.fn().mockResolvedValue('OK'),
    xreadgroup: jest.fn().mockImplementation(neverResolves),
    xautoclaim: jest.fn().mockResolvedValue(['0', []]),
    xack: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('cartService RedisCatalogEventsSubscriber', () => {
  it('creates the cart-service consumer group with MKSTREAM on start', async () => {
    const fakeRedis = buildFakeRedis();
    const restore = { execute: jest.fn().mockResolvedValue(0) } as unknown as RestoreUnavailableItems;
    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, restore);

    await subscriber.start();

    expect(fakeRedis.xgroup).toHaveBeenCalledWith('CREATE', CATALOG_EVENTS_STREAM, 'cart-service', '0', 'MKSTREAM');
  });

  it('restores items and acks when an AVAILABILITY_CHANGED event turns a SKU available', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent({ sku: 'SKU-002', newIsAvailable: true });
    fakeRedis.xreadgroup.mockResolvedValueOnce([[CATALOG_EVENTS_STREAM, [entry(event, '1-0')]]]);
    const restore = { execute: jest.fn().mockResolvedValue(0) } as unknown as RestoreUnavailableItems;

    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, restore);
    await subscriber.start();
    await flush();

    expect(restore.execute).toHaveBeenCalledWith({ sku: 'SKU-002' });
    expect(fakeRedis.xack).toHaveBeenCalledWith(CATALOG_EVENTS_STREAM, 'cart-service', '1-0');
  });

  it('acks without restoring for events that are not a relevant availability change', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent({ type: 'PRICE_CHANGED', oldPrice: 100, newPrice: 200 } as Partial<CatalogEvent>);
    fakeRedis.xreadgroup.mockResolvedValueOnce([[CATALOG_EVENTS_STREAM, [entry(event, '2-0')]]]);
    const restore = { execute: jest.fn().mockResolvedValue(0) } as unknown as RestoreUnavailableItems;

    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, restore);
    await subscriber.start();
    await flush();

    expect(restore.execute).not.toHaveBeenCalled();
    expect(fakeRedis.xack).toHaveBeenCalledWith(CATALOG_EVENTS_STREAM, 'cart-service', '2-0');
  });

  it('leaves the entry pending (no ack) when restoring items fails', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent({ sku: 'SKU-003', newIsAvailable: true });
    fakeRedis.xreadgroup.mockResolvedValueOnce([[CATALOG_EVENTS_STREAM, [entry(event, '3-0')]]]);
    const restore = { execute: jest.fn().mockRejectedValue(new Error('mongo down')) } as unknown as RestoreUnavailableItems;

    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, restore);
    await subscriber.start();
    await flush();

    expect(restore.execute).toHaveBeenCalledWith({ sku: 'SKU-003' });
    expect(fakeRedis.xack).not.toHaveBeenCalled();
  });
});
