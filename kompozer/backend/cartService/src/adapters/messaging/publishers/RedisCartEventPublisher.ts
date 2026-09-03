/**
 * Redis Pub/Sub implementation of CartEventPublisher.
 */
import Redis from 'ioredis';
import { CartEvent } from '../../../domain/entities/CartEvent';
import { CartEventPublisher } from '../../../domain/ports/CartEventPublisher';
import { logger } from '../../../infrastructure/logger';

export const CART_EVENTS_CHANNEL = 'cart:events';

export class RedisCartEventPublisher implements CartEventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: CartEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await this.redis.publish(CART_EVENTS_CHANNEL, payload);
    logger.debug({ eventType: event.type, userId: event.userId }, 'Published cart event');
  }
}
