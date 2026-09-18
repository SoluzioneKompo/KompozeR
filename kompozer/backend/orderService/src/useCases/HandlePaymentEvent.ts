/**
 * Use case that reacts to a payment outcome event and forwards the
 * matching order on success. Only orders still AWAITING_PAYMENT are
 * affected, which makes this naturally idempotent against redelivery.
 * A failed attempt does NOT cancel the order — the customer can retry
 * payment (see CreatePayment); only an explicit CancelOrder, or the
 * order sitting unpaid past AWAITING_PAYMENT_TIMEOUT_MS (see
 * expireAbandonedOrder), ends it.
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
      logger.info(
        { event: 'order.payment_attempt_failed', orderId: order.id, paymentId: event.paymentId },
        'Payment attempt failed; order remains awaiting payment for retry',
      );
    }
  }
}
