/**
 * Redis subscriber for catalog availability events.
 * Triggers restoration flow when an unavailable SKU becomes available again.
 */
import Redis from 'ioredis';
import { CatalogEvent } from '../../../domain/entities/CatalogEvent';
import { RestoreUnavailableItems } from '../../../useCases/RestoreUnavailableItems';
import { logger } from '../../../infrastructure/logger';

export const CATALOG_EVENTS_CHANNEL = 'catalog:events';

export class RedisCatalogEventsSubscriber {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly restoreUnavailableItems: RestoreUnavailableItems,
  ) {
    this.redis = new Redis(redisUrl);
  }

  async start(): Promise<void> {
    await this.redis.subscribe(CATALOG_EVENTS_CHANNEL);

    this.redis.on('message', (channel, payload) => {
      if (channel !== CATALOG_EVENTS_CHANNEL) {
        return;
      }

      try {
        const event = JSON.parse(payload) as CatalogEvent;
        if (event.type === 'AVAILABILITY_CHANGED' && event.newIsAvailable) {
          logger.info(
            { event: 'cart.item.restored.success', sku: event.sku },
            'Restoring cart items for SKU that became available again',
          );
          void this.restoreUnavailableItems.execute({ sku: event.sku });
        }
      } catch (error) {
        logger.error({ err: error }, 'Invalid catalog event payload');
      }
    });

    logger.info({ channel: CATALOG_EVENTS_CHANNEL }, 'Subscribed to catalog:events');
  }

  async stop(): Promise<void> {
    await this.redis.quit();
  }
}
