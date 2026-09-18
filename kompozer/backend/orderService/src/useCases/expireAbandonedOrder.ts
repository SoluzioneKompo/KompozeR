/**
 * Lazy expiry for AWAITING_PAYMENT orders nobody ever paid or cancelled.
 * Checked on read (GetOrder/ListOrders) instead of a background sweep —
 * no new process to run, and an order nobody looks at again costs nothing
 * left dangling.
 */
import { Order } from '../domain/entities/Order';
import { OrderRepository } from '../domain/ports/OrderRepository';

export const AWAITING_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

export function isOrderAbandoned(order: Order, now: Date): boolean {
  return (
    order.status === 'AWAITING_PAYMENT' &&
    now.getTime() - order.submittedAt.getTime() > AWAITING_PAYMENT_TIMEOUT_MS
  );
}

export async function expireIfAbandoned(
  order: Order,
  repo: OrderRepository,
  now: Date = new Date(),
): Promise<Order> {
  if (!isOrderAbandoned(order, now)) {
    return order;
  }

  const expired: Order = { ...order, status: 'CANCELLED', cancelledAt: now };
  await repo.update(expired);
  return expired;
}
