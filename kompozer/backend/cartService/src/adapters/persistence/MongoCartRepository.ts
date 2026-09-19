/**
 * MongoDB implementation of CartRepository.
 */
import { Cart } from '../../domain/entities/Cart';
import { CartRepository } from '../../domain/ports/CartRepository';
import { CartModel } from './schemas/cartSchema';

export class MongoCartRepository implements CartRepository {
  private toEntity(doc: {
    userId: string;
    items: Cart['items'];
    removedUnavailableItems?: Map<string, { sku: string; name: string; quantity: number; removedAt: Date }>
      | Record<string, { sku: string; name: string; quantity: number; removedAt: Date }>;
    total: number;
    updatedAt: Date;
    configId?: string;
    configName?: string;
  }): Cart {
    const removedRaw = doc.removedUnavailableItems;
    const removedAsRecord = removedRaw instanceof Map
      ? Object.fromEntries(removedRaw.entries())
      : (removedRaw ?? {});

    return {
      userId: doc.userId,
      items: doc.items,
      removedUnavailableItems: removedAsRecord,
      total: doc.total,
      updatedAt: doc.updatedAt,
      ...(doc.configId ? { configId: doc.configId } : {}),
      ...(doc.configName ? { configName: doc.configName } : {}),
    };
  }

  async findByUserId(userId: string): Promise<Cart | null> {
    const doc = await CartModel.findOne({ userId }).lean();
    return doc ? this.toEntity(doc) : null;
  }

  async findByRemovedSku(sku: string): Promise<Cart[]> {
    const docs = await CartModel.find({ [`removedUnavailableItems.${sku}`]: { $exists: true } }).lean();
    return docs.map((doc) => this.toEntity(doc));
  }

  async upsert(cart: Cart): Promise<void> {
    await CartModel.findOneAndUpdate(
      { userId: cart.userId },
      {
        _id: cart.userId,
        userId: cart.userId,
        items: cart.items,
        removedUnavailableItems: cart.removedUnavailableItems ?? {},
        total: cart.total,
        updatedAt: cart.updatedAt,
        ...(cart.configId ? { configId: cart.configId } : {}),
        ...(cart.configName ? { configName: cart.configName } : {}),
      },
      { upsert: true },
    );
  }

  async clear(userId: string): Promise<void> {
    await CartModel.findOneAndUpdate(
      { userId },
      {
        _id: userId,
        userId,
        items: [],
        removedUnavailableItems: {},
        total: 0,
        updatedAt: new Date(),
      },
      { upsert: true },
    );
  }
}
