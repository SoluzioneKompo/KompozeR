/**
 * Unit tests for RedisPaymentEventPublisher adapter.
 */
import { PAYMENT_EVENTS_STREAM, RedisPaymentEventPublisher } from '../../../src/adapters/messaging/publishers/RedisPaymentEventPublisher';
import { PaymentEvent } from '../../../src/domain/entities/PaymentEvent';

describe('RedisPaymentEventPublisher', () => {
  it('appends payment events to the payment:events stream as a JSON payload field, trimmed', async () => {
    const xadd = jest.fn().mockResolvedValue('1-0');
    const redis = { xadd };
    const publisher = new RedisPaymentEventPublisher(redis as never);

    const event: PaymentEvent = {
      eventId: 'evt_1',
      type: 'PAYMENT_COMPLETED',
      occurredAt: new Date(),
      paymentId: 'pay_1',
      orderId: 'order_1',
    };

    await publisher.publish(event);

    expect(xadd).toHaveBeenCalledTimes(1);
    expect(xadd).toHaveBeenCalledWith(
      PAYMENT_EVENTS_STREAM,
      'MAXLEN',
      '~',
      10_000,
      '*',
      'payload',
      JSON.stringify(event),
    );
  });
});
