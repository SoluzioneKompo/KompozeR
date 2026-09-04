/**
 * [DS] Redis Streams implementation of CatalogEventPublisher.
 * Appends catalog events to stream `catalog:events`. Both cartService and
 * notificationService read this stream through their own consumer group,
 * so a service that's offline when an event is appended still sees it once
 * it reconnects — unlike Pub/Sub, where the message would simply be lost.
 * Trimmed to the last ~10k entries so the stream doesn't grow unbounded.
 *
 * Each entry carries a single `payload` field holding the JSON-serialized
 * CatalogEvent.
 */
import Redis             from 'ioredis';
import { CatalogEventPublisher } from '../../../domain/ports/CatalogEventPublisher';
import { CatalogEvent }          from '../../../domain/entities/CatalogEvent';

export const CATALOG_EVENTS_STREAM = 'catalog:events';
const STREAM_MAXLEN = 10_000;

export class RedisCatalogEventPublisher implements CatalogEventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: CatalogEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await this.redis.xadd(
      CATALOG_EVENTS_STREAM,
      'MAXLEN',
      '~',
      STREAM_MAXLEN,
      '*',
      'payload',
      payload,
    );
    console.log(`[catalog][redis-publisher] Published ${event.type} for SKU ${event.sku}`);
  }
}
