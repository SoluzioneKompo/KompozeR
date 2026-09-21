/**
 * Redis Streams consumer for payment:events (consumer group 'order-service').
 *
 * Unlike Pub/Sub, a stream persists entries and tracks per-consumer-group
 * delivery: if this service is down when paymentService appends an event,
 * the entry is still there — and still undelivered to this group — once it
 * reconnects. Entries are only removed from the pending list (XACK) after
 * HandlePaymentEvent successfully processes them; anything left pending
 * past STALE_MS (e.g. a crash mid-processing) is reclaimed via XAUTOCLAIM
 * and retried. HandlePaymentEvent is naturally idempotent (it only acts on
 * orders still AWAITING_PAYMENT), so re-delivery is safe.
 *
 * Takes an already-constructed Redis client (rather than a URL) so it can
 * be unit tested without a real server — see the publisher for the same
 * convention.
 */
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { PaymentEvent } from '../../../domain/entities/PaymentEvent';
import { HandlePaymentEvent } from '../../../useCases/HandlePaymentEvent';
import { logger } from '../../../infrastructure/logger';

export const PAYMENT_EVENTS_STREAM = 'payment:events';
const CONSUMER_GROUP = 'order-service';
const BLOCK_MS = 5_000;
const READ_COUNT = 10;
const STALE_MS = 30_000;
const RETRY_DELAY_MS = 1_000;

type StreamEntry = [id: string, fields: string[]];

export class RedisPaymentEventsSubscriber {
  private readonly consumerName = `${CONSUMER_GROUP}-${randomUUID()}`;
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly handler: HandlePaymentEvent,
  ) {}

  async start(): Promise<void> {
    await this.ensureGroup();
    this.running = true;
    void this.loop();
    logger.info({ event: 'order.redis.subscribed', stream: PAYMENT_EVENTS_STREAM }, 'Subscribed to payment:events');
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.redis.quit();
  }

  private async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', PAYMENT_EVENTS_STREAM, CONSUMER_GROUP, '0', 'MKSTREAM');
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
          PAYMENT_EVENTS_STREAM,
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
          logger.error({ err: error }, 'payment:events read loop failed');
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
  }

  private async claimStale(): Promise<void> {
    try {
      const [, entries] = (await this.redis.xautoclaim(
        PAYMENT_EVENTS_STREAM,
        CONSUMER_GROUP,
        this.consumerName,
        STALE_MS,
        '0',
      )) as [string, StreamEntry[], string[]];

      for (const [id, fields] of entries) {
        await this.processEntry(id, fields);
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to claim stale payment events');
    }
  }

  private async processEntry(id: string, fields: string[]): Promise<void> {
    let event: PaymentEvent;
    try {
      const payload = this.extractPayload(fields);
      if (payload === null) {
        throw new Error('entry missing payload field');
      }
      event = JSON.parse(payload) as PaymentEvent;
    } catch (error) {
      logger.error({ err: error, id }, 'Invalid payment event payload; acking to drop poison message');
      await this.redis.xack(PAYMENT_EVENTS_STREAM, CONSUMER_GROUP, id);
      return;
    }

    try {
      await this.handler.execute(event);
      await this.redis.xack(PAYMENT_EVENTS_STREAM, CONSUMER_GROUP, id);
    } catch (error) {
      logger.error({ err: error, id, paymentEventId: event.eventId }, 'Failed to process payment event; leaving pending for retry');
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
