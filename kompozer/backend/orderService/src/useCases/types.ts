/**
 * Input/output contracts for orderService use cases.
 */
import { Order, OrderItem, OrderStatus } from '../domain/entities/Order';

export interface OrderDto {
  id: string;
  userId: string;
  expeditionInfo: Order['expeditionInfo'];
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  submittedAt: string;
  doneAt?: string;
  cancelledAt?: string;
}

export interface CreateOrderInput {
  userId: string;
  expeditionInfo: Order['expeditionInfo'];
  items: OrderItem[];
  total: number;
}

export interface ListOrdersInput {
  userId: string;
  role?: string;
}

export interface GetOrderInput {
  userId: string;
  orderId: string;
}

export interface CancelOrderInput {
  userId: string;
  orderId: string;
  role?: string;
}

export interface UpdateOrderStatusInput {
  orderId: string;
  status: 'DONE';
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    userId: order.userId,
    expeditionInfo: { ...order.expeditionInfo },
    items: order.items.map((item) => ({ ...item })),
    total: order.total,
    status: order.status,
    submittedAt: order.submittedAt.toISOString(),
    doneAt: order.doneAt?.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString(),
  };
}
