/**
 * Unit tests for RedisPaymentEventsSubscriber's ack/no-ack behavior.
 * The fake Redis client is injected directly (no real server needed).
 *
 * Every scenario scripts xreadgroup/xautoclaim to resolve for the calls
 * under test and then hang forever (a Promise that never settles) rather
 * than keep resolving. A parked `await` on a never-settling promise costs
 * nothing and never fires again — unlike a mock that keeps resolving
 * immediately, which would spin the subscriber's read loop as fast as the
 * microtask queue allows and starve the test runner's own timers.
 */
import {
  PAYMENT_EVENTS_STREAM,
  RedisPaymentEventsSubscriber,
} from '../../../src/adapters/messaging/subscribers/RedisPaymentEventsSubscriber';
import { HandlePaymentEvent } from '../../../src/useCases/HandlePaymentEvent';
import { PaymentEvent } from '../../../src/domain/entities/PaymentEvent';

function neverResolves(): Promise<never> {
  return new Promise(() => {});
}

function buildEvent(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    eventId: 'evt_1',
    type: 'PAYMENT_COMPLETED',
    occurredAt: new Date().toISOString(),
    paymentId: 'pay_1',
    orderId: 'order_1',
    ...overrides,
  };
}

function entry(event: PaymentEvent, id = '1-0'): [string, string[]] {
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

describe('RedisPaymentEventsSubscriber', () => {
  it('creates the consumer group with MKSTREAM on start', async () => {
    const fakeRedis = buildFakeRedis();
    const handler = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as HandlePaymentEvent;
    const subscriber = new RedisPaymentEventsSubscriber(fakeRedis as never, handler);

    await subscriber.start();

    expect(fakeRedis.xgroup).toHaveBeenCalledWith('CREATE', PAYMENT_EVENTS_STREAM, 'order-service', '0', 'MKSTREAM');
  });

  it('does not throw when the consumer group already exists (BUSYGROUP)', async () => {
    const fakeRedis = buildFakeRedis();
    fakeRedis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));
    const handler = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as HandlePaymentEvent;
    const subscriber = new RedisPaymentEventsSubscriber(fakeRedis as never, handler);

    await expect(subscriber.start()).resolves.toBeUndefined();
  });

  it('acks an entry after the handler processes it successfully', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent();
    fakeRedis.xreadgroup.mockResolvedValueOnce([[PAYMENT_EVENTS_STREAM, [entry(event, '1-0')]]]);
    const handler = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as HandlePaymentEvent;

    const subscriber = new RedisPaymentEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).toHaveBeenCalledWith(event);
    expect(fakeRedis.xack).toHaveBeenCalledWith(PAYMENT_EVENTS_STREAM, 'order-service', '1-0');
  });

  it('leaves the entry pending (no ack) when the handler throws', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent();
    fakeRedis.xreadgroup.mockResolvedValueOnce([[PAYMENT_EVENTS_STREAM, [entry(event, '2-0')]]]);
    const handler = { execute: jest.fn().mockRejectedValue(new Error('mongo down')) } as unknown as HandlePaymentEvent;

    const subscriber = new RedisPaymentEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).toHaveBeenCalledWith(event);
    expect(fakeRedis.xack).not.toHaveBeenCalled();
  });

  it('acks and drops an entry with an invalid JSON payload instead of retrying forever', async () => {
    const fakeRedis = buildFakeRedis();
    fakeRedis.xreadgroup.mockResolvedValueOnce([[PAYMENT_EVENTS_STREAM, [['3-0', ['payload', '{ not valid json']]]]]);
    const handler = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as HandlePaymentEvent;

    const subscriber = new RedisPaymentEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).not.toHaveBeenCalled();
    expect(fakeRedis.xack).toHaveBeenCalledWith(PAYMENT_EVENTS_STREAM, 'order-service', '3-0');
  });

  it('reclaims and processes stale pending entries via xautoclaim', async () => {
    const fakeRedis = buildFakeRedis();
    const event = buildEvent({ eventId: 'evt_stale' });
    fakeRedis.xautoclaim.mockResolvedValueOnce(['0', [entry(event, '4-0')]]);
    const handler = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as HandlePaymentEvent;

    const subscriber = new RedisPaymentEventsSubscriber(fakeRedis as never, handler);
    await subscriber.start();
    await flush();

    expect(handler.execute).toHaveBeenCalledWith(event);
    expect(fakeRedis.xack).toHaveBeenCalledWith(PAYMENT_EVENTS_STREAM, 'order-service', '4-0');
  });
});
