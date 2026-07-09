/**
 * In-memory fake adapters for cartService tests.
 */
import { Cart } from '../../src/domain/entities/Cart';
import { CartEvent } from '../../src/domain/entities/CartEvent';
import { CatalogItemSnapshot, CatalogSnapshotProvider } from '../../src/domain/ports/CatalogSnapshotProvider';
import { CartEventPublisher } from '../../src/domain/ports/CartEventPublisher';
import { OrderServiceClient, SubmitOrderInput, SubmitOrderOutput } from '../../src/domain/ports/OrderServiceClient';
import { CartRepository } from '../../src/domain/ports/CartRepository';

export class FakeCartRepository implements CartRepository {
  private store = new Map<string, Cart>();

  private clone(cart: Cart): Cart {
    return {
      ...cart,
      items: cart.items.map((it) => ({ ...it })),
      removedUnavailableItems: cart.removedUnavailableItems
        ? Object.fromEntries(
          Object.entries(cart.removedUnavailableItems).map(([sku, snapshot]) => [
            sku,
            { ...snapshot, removedAt: new Date(snapshot.removedAt) },
          ]),
        )
        : undefined,
    };
  }

  async findByUserId(userId: string): Promise<Cart | null> {
    const cart = this.store.get(userId);
    return cart ? this.clone(cart) : null;
  }

  async upsert(cart: Cart): Promise<void> {
    this.store.set(cart.userId, this.clone(cart));
  }

  async findByRemovedSku(sku: string): Promise<Cart[]> {
    return [...this.store.values()]
      .filter((cart) => Boolean(cart.removedUnavailableItems?.[sku]))
      .map((cart) => this.clone(cart));
  }

  async clear(userId: string): Promise<void> {
    this.store.set(userId, {
      userId,
      items: [],
      total: 0,
      updatedAt: new Date(),
    });
  }
}

export class FakeCatalogSnapshotProvider implements CatalogSnapshotProvider {
  private snapshots = new Map<string, CatalogItemSnapshot>();

  set(snapshot: CatalogItemSnapshot): void {
    this.snapshots.set(snapshot.sku, snapshot);
  }

  async getBySku(sku: string): Promise<CatalogItemSnapshot | null> {
    return this.snapshots.get(sku) ?? null;
  }
}

export class FakeCartEventPublisher implements CartEventPublisher {
  readonly events: CartEvent[] = [];

  async publish(event: CartEvent): Promise<void> {
    this.events.push(event);
  }
}

export class FakeOrderServiceClient implements OrderServiceClient {
  readonly calls: SubmitOrderInput[] = [];

  async submitOrder(input: SubmitOrderInput): Promise<SubmitOrderOutput> {
    this.calls.push({
      userId: input.userId,
      expeditionInfo: { ...input.expeditionInfo },
      items: input.items.map((item) => ({ ...item })),
      total: input.total,
    });

    return {
      orderId: 'ord_1',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }
}
