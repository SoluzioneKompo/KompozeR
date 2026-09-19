/**
 * Use case for inserting/updating a cart line item.
 * Validates input, recomputes totals, persists cart, and publishes cart events.
 */
import { Cart, CartItem, computeCartTotal, computeLineTotal } from '../domain/entities/Cart';
import { CartEvent } from '../domain/entities/CartEvent';
import { CartConfigConflictError, ValidationError } from '../domain/entities/errors';
import { CartEventPublisher } from '../domain/ports/CartEventPublisher';
import { CartRepository } from '../domain/ports/CartRepository';
import { GetCartOutput, UpsertCartItemInput } from './types';

export class UpsertCartItem {
  constructor(
    private readonly cartRepo: CartRepository,
    private readonly eventPublisher: CartEventPublisher = { publish: async () => {} },
  ) {}

  async execute(input: UpsertCartItemInput): Promise<GetCartOutput> {
    if (!input.sku || !input.name) {
      throw new ValidationError('sku and name are required');
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ValidationError('quantity must be a positive integer');
    }
    if (!Number.isInteger(input.unitPrice) || input.unitPrice < 0) {
      throw new ValidationError('unitPrice must be an integer >= 0');
    }

    const existingCart = await this.cartRepo.findByUserId(input.userId);
    const cart =
      existingCart ?? ({ userId: input.userId, items: [], total: 0, updatedAt: new Date() } as Cart);

    // A cart holds items from at most one CAD configuration (or none, for
    // plain catalog purchases) so an order can always be traced back to a
    // single configuration. Reject anything that would mix the two.
    if (cart.items.length > 0) {
      if (input.configId && cart.configId && cart.configId !== input.configId) {
        throw new CartConfigConflictError(
          `Cart already contains items from configuration "${cart.configName ?? cart.configId}". Checkout or clear the cart before adding a different configuration.`,
        );
      }
      if (input.configId && !cart.configId) {
        throw new CartConfigConflictError(
          'Cart already contains manually added items. Checkout or clear the cart before adding a configuration.',
        );
      }
      if (!input.configId && cart.configId) {
        throw new CartConfigConflictError(
          `Cart is reserved for configuration "${cart.configName ?? cart.configId}". Checkout or clear the cart before adding other items.`,
        );
      }
    }
    if (input.configId) {
      cart.configId = input.configId;
      cart.configName = input.configName ?? cart.configName;
    }

    const updatedItem: CartItem = {
      sku: input.sku,
      name: input.name,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      lineTotal: computeLineTotal(input.unitPrice, input.quantity),
    };

    const idx = cart.items.findIndex((it) => it.sku === input.sku);
    const isNewItem = idx < 0;
    if (idx >= 0) {
      cart.items[idx] = updatedItem;
    } else {
      cart.items.push(updatedItem);
    }

    cart.total = computeCartTotal(cart.items);
    cart.updatedAt = new Date();

    await this.cartRepo.upsert(cart);

    if (!existingCart) {
      await this.eventPublisher.publish(
        this.buildEvent({
          type: 'CartCreated',
          userId: input.userId,
        }),
      );
    }

    if (isNewItem) {
      await this.eventPublisher.publish(
        this.buildEvent({
          type: 'ItemAddedToCart',
          userId: input.userId,
          sku: input.sku,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          source: 'MANUAL',
        }),
      );
    }

    return {
      userId: cart.userId,
      items: cart.items,
      total: cart.total,
      updatedAt: cart.updatedAt,
      ...(cart.configId ? { configId: cart.configId, configName: cart.configName } : {}),
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
