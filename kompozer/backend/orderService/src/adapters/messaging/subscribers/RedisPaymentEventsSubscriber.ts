/**
 * Redis Pub/Sub subscriber for payment events.
 * Forwards decoded events to HandlePaymentEvent use case.
 */
import Redis from 'ioredis';
import { PaymentEvent } from '../../../domain/entities/PaymentEvent';
import { HandlePaymentEvent } from '../../../useCases/HandlePaymentEvent';
import { logger } from '../../../infrastructure/logger';

export const PAYMENT_EVENTS_CHANNEL = 'payment:events';

export class RedisPaymentEventsSubscriber {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly handler: HandlePaymentEvent,
  ) {
    this.redis = new Redis(redisUrl);
  }

  async start(): Promise<void> {
    await this.redis.subscribe(PAYMENT_EVENTS_CHANNEL);
    this.redis.on('message', (channel, payload) => {
      if (channel !== PAYMENT_EVENTS_CHANNEL) return;

      try {
        const event = JSON.parse(payload) as PaymentEvent;
        void this.handler.execute(event);
      } catch (error) {
        logger.error({ err: error }, 'Invalid payment event payload');
      }
    });

    logger.info({ event: 'order.redis.subscribed' }, 'Subscribed to payment:events');
  }

  async stop(): Promise<void> {
    await this.redis.quit();
  }
}
