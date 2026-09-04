/**
 * Use case that reacts to a payment outcome event and forwards or
 * cancels the matching order. Only orders still AWAITING_PAYMENT are
 * affected, which makes this naturally idempotent against redelivery.
 */
import { PaymentEvent } from '../domain/entities/PaymentEvent';
import { OrderRepository } from '../domain/ports/OrderRepository';
import { logger } from '../infrastructure/logger';

export class HandlePaymentEvent {
  constructor(private readonly repo: OrderRepository) {}

  async execute(event: PaymentEvent): Promise<void> {
    const order = await this.repo.findById(event.orderId);
    if (!order) {
      logger.warn(
        { event: 'order.payment_event.order_not_found', orderId: event.orderId, paymentEventId: event.eventId },
        'Received payment event for unknown order',
      );
      return;
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      return;
    }

    if (event.type === 'PAYMENT_COMPLETED') {
      await this.repo.update({ ...order, status: 'SUBMITTED' });
      logger.info(
        { event: 'order.forwarded', orderId: order.id, paymentId: event.paymentId },
        'Order forwarded after payment completion',
      );
    } else {
      await this.repo.update({ ...order, status: 'CANCELLED', cancelledAt: new Date() });
      logger.info(
        { event: 'order.cancelled_payment_failed', orderId: order.id, paymentId: event.paymentId },
        'Order cancelled after payment failure',
      );
    }
  }
}
