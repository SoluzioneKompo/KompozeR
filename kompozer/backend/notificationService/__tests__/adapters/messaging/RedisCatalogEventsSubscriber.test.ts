/**
 * Unit tests for notificationService's RedisCatalogEventsSubscriber
 * ack/no-ack behavior. See orderService's equivalent test for why every
 * scenario scripts xreadgroup/xautoclaim to hang forever after the calls
 * under test, rather than keep resolving.
 */
import {
  CATALOG_EVENTS_STREAM,
  RedisCatalogEventsSubscriber,
} from '../../../src/adapters/messaging/subscribers/RedisCatalogEventsSubscriber';
import { HandleCatalogEvent } from '../../../src/useCases/HandleCatalogEvent';
import { CatalogEvent } from '../../../src/domain/entities/CatalogEvent';

function neverResolves(): Promise<never> {
  return new Promise(() => {});
}

function buildEvent(overrides: Partial<CatalogEvent> = {}): CatalogEvent {
  return {
    eventId: 'evt_1',
    type: 'PRICE_CHANGED',
    occurredAt: new Date().toISOString(),
    componentId: 'comp_1',
    sku: 'SKU-001',
    changedBy: 'adm_1',
    oldPrice: 100,
    newPrice: 200,
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

describe('notificationService RedisCatalogEventsSubscriber', () => {
  it('creates the notification-service consumer group with MKSTREAM on start', async () => {
    const fakeRedis = buildFakeRedis();
    const handler = { execute: jest.fn().mockResolvedValue(0) } as unknown as HandleCatalogEvent;
    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, handler);

    await subscriber.start();

    expect(fakeRedis.xgroup).toHaveBeenCalledWith('CREATE', CATALOG_EVENTS_STREAM, 'notification-service', '0', 'MKSTREAM');
  });

  it('acks an entry after the handler processes it successfully', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent();
    fakeRedis.xreadgroup.mockResolvedValueOnce([[CATALOG_EVENTS_STREAM, [entry(event, '1-0')]]]);
    const handler = { execute: jest.fn().mockResolvedValue(0) } as unknown as HandleCatalogEvent;

    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).toHaveBeenCalledWith(event);
    expect(fakeRedis.xack).toHaveBeenCalledWith(CATALOG_EVENTS_STREAM, 'notification-service', '1-0');
  });

  it('leaves the entry pending (no ack) when the handler throws', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent();
    fakeRedis.xreadgroup.mockResolvedValueOnce([[CATALOG_EVENTS_STREAM, [entry(event, '2-0')]]]);
    const handler = { execute: jest.fn().mockRejectedValue(new Error('mongo down')) } as unknown as HandleCatalogEvent;

    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).toHaveBeenCalledWith(event);
    expect(fakeRedis.xack).not.toHaveBeenCalled();
  });

  it('reclaims and processes stale pending entries via xautoclaim', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent({ eventId: 'evt_stale' });
    fakeRedis.xautoclaim.mockResolvedValueOnce(['0', [entry(event, '3-0')]]);
    const handler = { execute: jest.fn().mockResolvedValue(0) } as unknown as HandleCatalogEvent;

    const subscriber = new RedisCatalogEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).toHaveBeenCalledWith(event);
    expect(fakeRedis.xack).toHaveBeenCalledWith(CATALOG_EVENTS_STREAM, 'notification-service', '3-0');
  });
});
