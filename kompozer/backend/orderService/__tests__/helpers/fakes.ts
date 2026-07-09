/**
 * In-memory fake implementations for orderService tests.
 */
import { Order } from '../../src/domain/entities/Order';
import { OrderRepository } from '../../src/domain/ports/OrderRepository';

export class FakeOrderRepository implements OrderRepository {
  private orders = new Map<string, Order>();

  async create(order: Order): Promise<void> {
    this.orders.set(order.id, {
      ...order,
      expeditionInfo: { ...order.expeditionInfo },
      items: order.items.map((item) => ({ ...item })),
    });
  }

  async findById(orderId: string): Promise<Order | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }
    return {
      ...order,
      expeditionInfo: { ...order.expeditionInfo },
      items: order.items.map((item) => ({ ...item })),
    };
  }

  async listByUserId(userId: string): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .map((order) => ({
        ...order,
        expeditionInfo: { ...order.expeditionInfo },
        items: order.items.map((item) => ({ ...item })),
      }));
  }

  async listAll(): Promise<Order[]> {
    return [...this.orders.values()]
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .map((order) => ({
        ...order,
        expeditionInfo: { ...order.expeditionInfo },
        items: order.items.map((item) => ({ ...item })),
      }));
  }

  async update(order: Order): Promise<void> {
    this.orders.set(order.id, {
      ...order,
      expeditionInfo: { ...order.expeditionInfo },
      items: order.items.map((item) => ({ ...item })),
    });
  }
}
