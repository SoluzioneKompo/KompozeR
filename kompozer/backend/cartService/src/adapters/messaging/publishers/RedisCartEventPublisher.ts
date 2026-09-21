/**
 * Redis Streams implementation of CartEventPublisher.
 * Appends cart events to stream `cart:events`, trimmed to the last ~10k
 * entries. Durable like the other event streams in this system — see
 * RedisCatalogEventPublisher for why that matters over plain Pub/Sub.
 */
import Redis from 'ioredis';
import { CartEvent } from '../../../domain/entities/CartEvent';
import { CartEventPublisher } from '../../../domain/ports/CartEventPublisher';
import { logger } from '../../../infrastructure/logger';

export const CART_EVENTS_STREAM = 'cart:events';
const STREAM_MAXLEN = 10_000;

export class RedisCartEventPublisher implements CartEventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: CartEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await this.redis.xadd(
      CART_EVENTS_STREAM,
      'MAXLEN',
      '~',
      STREAM_MAXLEN,
      '*',
      'payload',
      payload,
    );
    logger.debug({ eventType: event.type, userId: event.userId }, 'Published cart event');
  }
}
