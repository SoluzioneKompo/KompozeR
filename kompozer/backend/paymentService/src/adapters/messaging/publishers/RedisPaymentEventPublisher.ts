/**
 * Redis Pub/Sub implementation of PaymentEventPublisher.
 * Publishes payment events on Redis channel `payment:events`.
 * orderService subscribes to this channel to forward orders only once
 * their payment is confirmed.
 *
 * Each message is a JSON-serialized PaymentEvent string.
 */
import Redis from 'ioredis';
import { PaymentEventPublisher } from '../../../domain/ports/PaymentEventPublisher';
import { PaymentEvent } from '../../../domain/entities/PaymentEvent';

export const PAYMENT_EVENTS_CHANNEL = 'payment:events';

export class RedisPaymentEventPublisher implements PaymentEventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: PaymentEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await this.redis.publish(PAYMENT_EVENTS_CHANNEL, payload);
    console.log(`[payment][redis-publisher] Published ${event.type} for order ${event.orderId}`);
  }
}
