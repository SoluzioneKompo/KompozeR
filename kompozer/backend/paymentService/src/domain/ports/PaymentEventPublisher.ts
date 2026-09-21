/**
 * Domain port for publishing payment lifecycle events.
 */
import { PaymentEvent } from '../entities/PaymentEvent';

export interface PaymentEventPublisher {
  publish(event: PaymentEvent): Promise<void>;
}
