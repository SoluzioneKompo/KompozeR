/**
 * Use case for cart checkout.
 * Revalidates price/availability against catalog, submits order, and clears cart.
 */
import {
  CartEmptyError,
  CartItemUnavailableError,
  ValidationError,
} from '../domain/entities/errors';
import { CartEvent } from '../domain/entities/CartEvent';
import { CartRepository } from '../domain/ports/CartRepository';
import { CartEventPublisher } from '../domain/ports/CartEventPublisher';
import { CatalogSnapshotProvider } from '../domain/ports/CatalogSnapshotProvider';
import { OrderServiceClient } from '../domain/ports/OrderServiceClient';
import { CheckoutCartInput, CheckoutCartOutput } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAP_RE = /^\d{4,10}$/;

const MAX_NAME_LENGTH = 100;
const MAX_MAIL_LENGTH = 254;
const MAX_LOCATION_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 200;
const MAX_PHONE_LENGTH = 30;
const MAX_DELIVERY_NOTES_LENGTH = 500;

export class CheckoutCart {
  constructor(
    private readonly cartRepo: CartRepository,
    private readonly catalog: CatalogSnapshotProvider,
    private readonly orderServiceClient: OrderServiceClient,
    private readonly eventPublisher: CartEventPublisher = { publish: async () => {} },
  ) {}

  async execute(input: CheckoutCartInput): Promise<CheckoutCartOutput> {
    const expeditionInfo = this.validateExpeditionInfo(input);
    const cart = await this.cartRepo.findByUserId(input.userId);
    if (!cart || cart.items.length === 0) {
      throw new CartEmptyError();
    }

    // Sync prices from catalog before checkout: update stale prices, remove unavailable items.
    const syncedItems = [];
    for (const item of cart.items) {
      const snapshot = await this.catalog.getBySku(item.sku);
      if (!snapshot || !snapshot.isAvailable) {
        throw new CartItemUnavailableError(item.sku);
      }
      if (snapshot.unitPrice !== item.unitPrice) {
        syncedItems.push({
          ...item,
          unitPrice: snapshot.unitPrice,
          lineTotal: snapshot.unitPrice * item.quantity,
        });
      } else {
        syncedItems.push(item);
      }
    }
    cart.items = syncedItems;
    cart.total = cart.items.reduce((sum, it) => sum + it.lineTotal, 0);

    const order = await this.orderServiceClient.submitOrder({
      userId: cart.userId,
      expeditionInfo,
      items: cart.items,
      total: cart.total,
    });

    await this.cartRepo.clear(cart.userId);

    await this.eventPublisher.publish(
      this.buildEvent({
        type: 'OrderRequestSubmitted',
        userId: cart.userId,
      }),
    );

    await this.eventPublisher.publish(
      this.buildEvent({
        type: 'OrderConfirmationRequested',
        userId: cart.userId,
      }),
    );

    return {
      orderId: order.orderId,
      status: 'SUBMITTED',
      userId: cart.userId,
      items: cart.items,
      total: cart.total,
      submittedAt: order.submittedAt,
    };
  }

  private buildEvent(event: Omit<CartEvent, 'eventId' | 'occurredAt'>): CartEvent {
    return {
      ...event,
      eventId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      occurredAt: new Date().toISOString(),
    };
  }

  private validateExpeditionInfo(input: CheckoutCartInput): CheckoutCartInput['expeditionInfo'] {
    if (!input.expeditionInfo) {
      throw new ValidationError('expeditionInfo is required');
    }

    const name = this.requireTrimmed(input.expeditionInfo.name, 'expeditionInfo.name', MAX_NAME_LENGTH);
    const surname = this.requireTrimmed(
      input.expeditionInfo.surname,
      'expeditionInfo.surname',
      MAX_NAME_LENGTH,
    );
    const mail = this.requireTrimmed(input.expeditionInfo.mail, 'expeditionInfo.mail', MAX_MAIL_LENGTH);
    const nation = this.requireTrimmed(
      input.expeditionInfo.nation,
      'expeditionInfo.nation',
      MAX_LOCATION_LENGTH,
    );
    const city = this.requireTrimmed(input.expeditionInfo.city, 'expeditionInfo.city', MAX_LOCATION_LENGTH);
    const cap = this.requireTrimmed(input.expeditionInfo.cap, 'expeditionInfo.cap', 10);
    const address = this.requireTrimmed(
      input.expeditionInfo.address,
      'expeditionInfo.address',
      MAX_ADDRESS_LENGTH,
    );
    const phone = this.requireTrimmed(input.expeditionInfo.phone, 'expeditionInfo.phone', MAX_PHONE_LENGTH);
    const deliveryNotes = this.optionalTrimmed(
      input.expeditionInfo.deliveryNotes,
      'expeditionInfo.deliveryNotes',
      MAX_DELIVERY_NOTES_LENGTH,
    );

    if (!EMAIL_RE.test(mail)) {
      throw new ValidationError('expeditionInfo.mail must be a valid email');
    }

    if (!CAP_RE.test(cap)) {
      throw new ValidationError('expeditionInfo.cap must contain 4 to 10 digits');
    }

    return {
      name,
      surname,
      mail,
      nation,
      city,
      cap,
      address,
      phone,
      ...(deliveryNotes ? { deliveryNotes } : {}),
    };
  }

  private requireTrimmed(value: string, field: string, maxLength: number): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ValidationError(`${field} is required`);
    }

    const normalized = value.trim();
    if (normalized.length > maxLength) {
      throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }

    return normalized;
  }

  private optionalTrimmed(value: string | undefined, field: string, maxLength: number): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }

    if (normalized.length > maxLength) {
      throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }

    return normalized;
  }
}
