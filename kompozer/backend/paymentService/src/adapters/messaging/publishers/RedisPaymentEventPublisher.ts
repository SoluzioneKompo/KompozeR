/**
 * Redis Streams implementation of PaymentEventPublisher.
 * Appends payment events to stream `payment:events`. Unlike Pub/Sub, a
 * stream persists entries — orderService (or any consumer group) can read
 * them even if it was offline when the event was appended, and redelivers
 * anything left unacknowledged after a crash. Trimmed to the last ~10k
 * entries so the stream doesn't grow unbounded.
 *
 * Each entry carries a single `payload` field holding the JSON-serialized
 * PaymentEvent.
 */
import Redis from 'ioredis';
import { PaymentEventPublisher } from '../../../domain/ports/PaymentEventPublisher';
import { PaymentEvent } from '../../../domain/entities/PaymentEvent';

export const PAYMENT_EVENTS_STREAM = 'payment:events';
const STREAM_MAXLEN = 10_000;

export class RedisPaymentEventPublisher implements PaymentEventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: PaymentEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await this.redis.xadd(
      PAYMENT_EVENTS_STREAM,
      'MAXLEN',
      '~',
      STREAM_MAXLEN,
      '*',
      'payload',
      payload,
    );
    console.log(`[payment][redis-publisher] Published ${event.type} for order ${event.orderId}`);
  }
}
