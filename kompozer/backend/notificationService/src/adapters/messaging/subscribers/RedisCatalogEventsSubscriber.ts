/**
 * Redis Pub/Sub subscriber for catalog events.
 * Forwards decoded events to HandleCatalogEvent use case.
 */
import Redis from 'ioredis';
import { CatalogEvent } from '../../../domain/entities/CatalogEvent';
import { HandleCatalogEvent } from '../../../useCases/HandleCatalogEvent';
import { logger } from '../../../infrastructure/logger';

export const CATALOG_EVENTS_CHANNEL = 'catalog:events';

export class RedisCatalogEventsSubscriber {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly handler: HandleCatalogEvent,
  ) {
    this.redis = new Redis(redisUrl);
  }

  async start(): Promise<void> {
    await this.redis.subscribe(CATALOG_EVENTS_CHANNEL);
    this.redis.on('message', (channel, payload) => {
      if (channel !== CATALOG_EVENTS_CHANNEL) return;

      try {
        const event = JSON.parse(payload) as CatalogEvent;
        void this.handler.execute(event);
      } catch (error) {
        logger.error({ err: error }, 'Invalid catalog event payload');
      }
    });

    logger.info({ event: 'notification.redis.subscribed' }, 'Subscribed to catalog:events');
  }

  async stop(): Promise<void> {
    await this.redis.quit();
  }
}
