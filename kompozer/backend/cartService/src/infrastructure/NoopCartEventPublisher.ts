/**
 * No-op CartEventPublisher used when messaging infrastructure is disabled.
 */
import { CartEvent } from '../domain/entities/CartEvent';
import { CartEventPublisher } from '../domain/ports/CartEventPublisher';
import { logger } from './logger';

export class NoopCartEventPublisher implements CartEventPublisher {
  async publish(event: CartEvent): Promise<void> {
    logger.debug({ event: event.type, cartEvent: event }, 'Noop publisher discarded event');
  }
}
