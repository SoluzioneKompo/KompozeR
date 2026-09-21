/**
 * Event published when a payment is finalized (COMPLETED or FAILED).
 * orderService subscribes to this to gate order progression on payment
 * outcome instead of forwarding orders before they're paid.
 */
export type PaymentEventType = 'PAYMENT_COMPLETED' | 'PAYMENT_FAILED';

export interface PaymentEvent {
  eventId: string;
  type: PaymentEventType;
  occurredAt: Date;
  paymentId: string;
  orderId: string;
  failureReason?: string;
}
