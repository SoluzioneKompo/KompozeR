/**
 * Use case for removing a SKU from cart.
 * If item existed, publishes ItemRemovedFromCart.
 */
import { computeCartTotal } from '../domain/entities/Cart';
import { CartEvent } from '../domain/entities/CartEvent';
import { CartEventPublisher } from '../domain/ports/CartEventPublisher';
import { CartRepository } from '../domain/ports/CartRepository';
import { GetCartOutput, RemoveCartItemInput } from './types';

export class RemoveCartItem {
  constructor(
    private readonly cartRepo: CartRepository,
    private readonly eventPublisher: CartEventPublisher = { publish: async () => {} },
  ) {}

  async execute(input: RemoveCartItemInput): Promise<GetCartOutput> {
    const cart = await this.cartRepo.findByUserId(input.userId);
    if (!cart) {
      return {
        userId: input.userId,
        items: [],
        total: 0,
        updatedAt: new Date(0),
      };
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter((item) => item.sku !== input.sku);
    const wasRemoved = cart.items.length < initialLength;
    cart.total = computeCartTotal(cart.items);
    cart.updatedAt = new Date();
    if (cart.items.length === 0) {
      // Empty cart holds no configuration reservation — release it so the
      // next add (catalog or a different configuration) isn't blocked.
      cart.configId = undefined;
      cart.configName = undefined;
    }
    await this.cartRepo.upsert(cart);

    if (wasRemoved) {
      await this.eventPublisher.publish(
        this.buildEvent({
          type: 'ItemRemovedFromCart',
          userId: input.userId,
          sku: input.sku,
          source: 'MANUAL',
        }),
      );
    }

    return {
      userId: cart.userId,
      items: cart.items,
      total: cart.total,
      updatedAt: cart.updatedAt,
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
