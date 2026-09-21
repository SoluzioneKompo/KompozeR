/**
 * MongoDB implementation of OrderRepository.
 */
import { Order } from '../../domain/entities/Order';
import { OrderRepository } from '../../domain/ports/OrderRepository';
import { OrderModel } from './schemas/orderSchema';

export class MongoOrderRepository implements OrderRepository {
  async create(order: Order): Promise<void> {
    await OrderModel.create({
      _id: order.id,
      userId: order.userId,
      expeditionInfo: { ...order.expeditionInfo },
      items: order.items.map((item) => ({ ...item })),
      total: order.total,
      status: order.status,
      submittedAt: order.submittedAt,
      doneAt: order.doneAt,
      cancelledAt: order.cancelledAt,
      configId: order.configId,
      configName: order.configName,
    });
  }

  async findById(orderId: string): Promise<Order | null> {
    const doc = await OrderModel.findById(orderId).lean();
    if (!doc) {
      return null;
    }

    return {
      id: doc._id,
      userId: doc.userId,
      expeditionInfo: { ...doc.expeditionInfo },
      items: doc.items.map((item) => ({ ...item })),
      total: doc.total,
      status: doc.status,
      submittedAt: doc.submittedAt,
      doneAt: doc.doneAt,
      cancelledAt: doc.cancelledAt,
      configId: doc.configId,
      configName: doc.configName,
    };
  }

  async listByUserId(userId: string): Promise<Order[]> {
    const docs = await OrderModel.find({ userId }).sort({ submittedAt: -1 }).lean();
    return docs.map((doc) => ({
      id: doc._id,
      userId: doc.userId,
      expeditionInfo: { ...doc.expeditionInfo },
      items: doc.items.map((item) => ({ ...item })),
      total: doc.total,
      status: doc.status,
      submittedAt: doc.submittedAt,
      doneAt: doc.doneAt,
      cancelledAt: doc.cancelledAt,
      configId: doc.configId,
      configName: doc.configName,
    }));
  }

  async listAll(): Promise<Order[]> {
    const docs = await OrderModel.find().sort({ submittedAt: -1 }).lean();
    return docs.map((doc) => ({
      id: doc._id,
      userId: doc.userId,
      expeditionInfo: { ...doc.expeditionInfo },
      items: doc.items.map((item) => ({ ...item })),
      total: doc.total,
      status: doc.status,
      submittedAt: doc.submittedAt,
      doneAt: doc.doneAt,
      cancelledAt: doc.cancelledAt,
      configId: doc.configId,
      configName: doc.configName,
    }));
  }

  async update(order: Order): Promise<void> {
    await OrderModel.findByIdAndUpdate(order.id, {
      userId: order.userId,
      expeditionInfo: { ...order.expeditionInfo },
      items: order.items.map((item) => ({ ...item })),
      total: order.total,
      status: order.status,
      submittedAt: order.submittedAt,
      doneAt: order.doneAt,
      cancelledAt: order.cancelledAt,
      configId: order.configId,
      configName: order.configName,
    });
  }
}
