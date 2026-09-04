/**
 * Unit tests for RedisPaymentEventPublisher adapter.
 */
import { PAYMENT_EVENTS_CHANNEL, RedisPaymentEventPublisher } from '../../../src/adapters/messaging/publishers/RedisPaymentEventPublisher';
import { PaymentEvent } from '../../../src/domain/entities/PaymentEvent';

describe('RedisPaymentEventPublisher', () => {
  it('publishes payment events to payment:events channel as JSON payload', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const redis = { publish } as unknown as { publish: (channel: string, payload: string) => Promise<number> };
    const publisher = new RedisPaymentEventPublisher(redis as never);

    const event: PaymentEvent = {
      eventId: 'evt_1',
      type: 'PAYMENT_COMPLETED',
      occurredAt: new Date(),
      paymentId: 'pay_1',
      orderId: 'order_1',
    };

    await publisher.publish(event);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(PAYMENT_EVENTS_CHANNEL, JSON.stringify(event));
  });
});
