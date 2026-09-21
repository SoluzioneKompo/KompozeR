/**
 * No-op PaymentEventPublisher used when messaging infrastructure is disabled.
 */
import { PaymentEvent } from '../domain/entities/PaymentEvent';
import { PaymentEventPublisher } from '../domain/ports/PaymentEventPublisher';
import { logger } from './logger';

export class NoopPaymentEventPublisher implements PaymentEventPublisher {
  async publish(event: PaymentEvent): Promise<void> {
    logger.debug({ event: event.type, paymentEvent: event }, 'Noop publisher discarded event');
  }
}
