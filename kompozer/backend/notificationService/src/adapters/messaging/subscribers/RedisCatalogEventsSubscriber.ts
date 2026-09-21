/**
 * Redis Streams consumer for catalog:events (consumer group
 * 'notification-service'). Forwards decoded events to HandleCatalogEvent,
 * which is itself idempotent (tracks processed event IDs), so redelivery
 * after a crash or restart is safe.
 *
 * Entries are only acked after the handler completes; anything left
 * pending past STALE_MS is reclaimed via XAUTOCLAIM and retried.
 *
 * Takes an already-constructed Redis client (rather than a URL) so it can
 * be unit tested without a real server.
 */
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { CatalogEvent } from '../../../domain/entities/CatalogEvent';
import { HandleCatalogEvent } from '../../../useCases/HandleCatalogEvent';
import { logger } from '../../../infrastructure/logger';

export const CATALOG_EVENTS_STREAM = 'catalog:events';
const CONSUMER_GROUP = 'notification-service';
const BLOCK_MS = 5_000;
const READ_COUNT = 10;
const STALE_MS = 30_000;
const RETRY_DELAY_MS = 1_000;

type StreamEntry = [id: string, fields: string[]];

export class RedisCatalogEventsSubscriber {
  private readonly consumerName = `${CONSUMER_GROUP}-${randomUUID()}`;
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly handler: HandleCatalogEvent,
  ) {}

  async start(): Promise<void> {
    await this.ensureGroup();
    this.running = true;
    void this.loop();
    logger.info({ event: 'notification.redis.subscribed' }, 'Subscribed to catalog:events');
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.redis.quit();
  }

  private async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', CATALOG_EVENTS_STREAM, CONSUMER_GROUP, '0', 'MKSTREAM');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.claimStale();
        if (!this.running) break;

        const result = (await this.redis.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          READ_COUNT,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          CATALOG_EVENTS_STREAM,
          '>',
        )) as [string, StreamEntry[]][] | null;

        if (!result) {
          continue;
        }

        for (const [, entries] of result) {
          for (const [id, fields] of entries) {
            await this.processEntry(id, fields);
          }
        }
      } catch (error) {
        if (this.running) {
          logger.error({ err: error }, 'catalog:events read loop failed');
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
  }

  private async claimStale(): Promise<void> {
    try {
      const [, entries] = (await this.redis.xautoclaim(
        CATALOG_EVENTS_STREAM,
        CONSUMER_GROUP,
        this.consumerName,
        STALE_MS,
        '0',
      )) as [string, StreamEntry[], string[]];

      for (const [id, fields] of entries) {
        await this.processEntry(id, fields);
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to claim stale catalog events');
    }
  }

  private async processEntry(id: string, fields: string[]): Promise<void> {
    let event: CatalogEvent;
    try {
      const payload = this.extractPayload(fields);
      if (payload === null) {
        throw new Error('entry missing payload field');
      }
      event = JSON.parse(payload) as CatalogEvent;
    } catch (error) {
      logger.error({ err: error, id }, 'Invalid catalog event payload; acking to drop poison message');
      await this.redis.xack(CATALOG_EVENTS_STREAM, CONSUMER_GROUP, id);
      return;
    }

    try {
      await this.handler.execute(event);
      await this.redis.xack(CATALOG_EVENTS_STREAM, CONSUMER_GROUP, id);
    } catch (error) {
      logger.error({ err: error, id, catalogEventId: event.eventId }, 'Failed to process catalog event; leaving pending for retry');
    }
  }

  private extractPayload(fields: string[]): string | null {
    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] === 'payload') {
        return fields[i + 1] ?? null;
      }
    }
    return null;
  }
}
