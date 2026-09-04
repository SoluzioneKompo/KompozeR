/**
 * Event consumed from paymentService when a payment is finalized.
 * Drives the AWAITING_PAYMENT -> SUBMITTED/CANCELLED transition so an
 * order is only forwarded once it's actually paid.
 */
export type PaymentEventType = 'PAYMENT_COMPLETED' | 'PAYMENT_FAILED';

export interface PaymentEvent {
  eventId: string;
  type: PaymentEventType;
  occurredAt: string | Date;
  paymentId: string;
  orderId: string;
  failureReason?: string;
}
