/**
 * Unit tests for RedisCartEventPublisher adapter.
 */
import { CART_EVENTS_STREAM, RedisCartEventPublisher } from '../../../src/adapters/messaging/publishers/RedisCartEventPublisher';
import { CartEvent } from '../../../src/domain/entities/CartEvent';

describe('RedisCartEventPublisher', () => {
  it('appends cart events to the cart:events stream as a JSON payload field, trimmed', async () => {
    const xadd = jest.fn().mockResolvedValue('1-0');
    const redis = { xadd };
    const publisher = new RedisCartEventPublisher(redis as never);

    const event: CartEvent = {
      eventId: 'evt_1',
      type: 'ItemAddedToCart',
      occurredAt: new Date().toISOString(),
      userId: 'usr_1',
      sku: 'SKU-001',
      quantity: 2,
      unitPrice: 1990,
      source: 'MANUAL',
    };

    await publisher.publish(event);

    expect(xadd).toHaveBeenCalledTimes(1);
    expect(xadd).toHaveBeenCalledWith(CART_EVENTS_STREAM, 'MAXLEN', '~', 10_000, '*', 'payload', JSON.stringify(event));
  });
});
