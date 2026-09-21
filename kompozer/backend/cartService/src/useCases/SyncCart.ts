/**
 * Use case for synchronizing cart with catalog snapshots.
 * Clears cart when any item becomes unavailable, otherwise updates stale prices.
 */
import { Cart, computeLineTotal, computeCartTotal } from '../domain/entities/Cart';
import { CartEvent } from '../domain/entities/CartEvent';
import { CartEventPublisher } from '../domain/ports/CartEventPublisher';
import { CartRepository } from '../domain/ports/CartRepository';
import { CatalogSnapshotProvider } from '../domain/ports/CatalogSnapshotProvider';
import { GetCartOutput, SyncCartInput } from './types';

export interface SyncCartResult extends GetCartOutput {
  /** SKUs removed because the item is no longer available in the catalog. */
  removedSkus: string[];
  /** SKUs whose unit price was updated from the catalog snapshot. */
  updatedSkus: string[];
}

export class SyncCart {
  constructor(
    private readonly cartRepo: CartRepository,
    private readonly catalog: CatalogSnapshotProvider,
    private readonly eventPublisher: CartEventPublisher = { publish: async () => {} },
  ) {}

  async execute(input: SyncCartInput): Promise<SyncCartResult> {
    const existing = await this.cartRepo.findByUserId(input.userId);
    if (!existing || existing.items.length === 0) {
      return {
        userId: input.userId,
        items: [],
        total: 0,
        updatedAt: existing?.updatedAt ?? new Date(0),
        removedSkus: [],
        updatedSkus: [],
      };
    }

    const removedSkus: string[] = [];
    const updatedSkus: string[] = [];

    // First pass: check availability for each item.
    const snapshots = await Promise.all(
      existing.items.map(async (item) => ({
        item,
        snapshot: await this.catalog.getBySku(item.sku),
      })),
    );

    const anyUnavailable = snapshots.some(({ snapshot }) => !snapshot || !snapshot.isAvailable);

    if (anyUnavailable) {
      // When any item is unavailable the entire cart is cleared.
      // All current items are snapshotted so the restore flow can replay them.
      const now = new Date();
      const removedUnavailableItems: Record<string, import('../domain/entities/Cart').RemovedUnavailableItemSnapshot> = {
        ...(existing.removedUnavailableItems ?? {}),
      };

      for (const { item } of snapshots) {
        removedUnavailableItems[item.sku] = {
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          removedAt: now,
        };
        removedSkus.push(item.sku);
      }

      const cleared: Cart = {
        ...existing,
        items: [],
        removedUnavailableItems,
        total: 0,
        updatedAt: now,
        configId: undefined,
        configName: undefined,
      };

      await this.cartRepo.upsert(cleared);

      await this.eventPublisher.publish(
        this.buildEvent({
          type: 'CartItemsRemovedUnavailable',
          userId: input.userId,
          removedSkus,
        }),
      );

      return {
        userId: cleared.userId,
        items: [],
        total: 0,
        updatedAt: cleared.updatedAt,
        removedSkus,
        updatedSkus: [],
      };
    }

    // No unavailable items: check for price updates only.
    const keptItems = snapshots.map(({ item, snapshot }) => {
      if (snapshot && snapshot.unitPrice !== item.unitPrice) {
        updatedSkus.push(item.sku);
        return {
          ...item,
          unitPrice: snapshot.unitPrice,
          lineTotal: computeLineTotal(snapshot.unitPrice, item.quantity),
        };
      }
      return item;
    });

    const hasChanges = updatedSkus.length > 0;

    if (hasChanges) {
      const updated: Cart = {
        ...existing,
        items: keptItems,
        removedUnavailableItems: existing.removedUnavailableItems,
        total: computeCartTotal(keptItems),
        updatedAt: new Date(),
      };

      await this.cartRepo.upsert(updated);

      await this.eventPublisher.publish(
        this.buildEvent({
          type: 'CartPricesUpdated',
          userId: input.userId,
          updatedSkus,
        }),
      );

      return {
        userId: updated.userId,
        items: updated.items,
        total: updated.total,
        updatedAt: updated.updatedAt,
        removedSkus: [],
        updatedSkus,
      };
    }

    return {
      userId: existing.userId,
      items: existing.items,
      total: existing.total,
      updatedAt: existing.updatedAt,
      removedSkus: [],
      updatedSkus: [],
    };
  }

  private buildEvent(event: Omit<CartEvent, 'eventId' | 'occurredAt'>): CartEvent {
    return {
      ...event,
      eventId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      occurredAt: new Date().toISOString(),
    };
  }
}
