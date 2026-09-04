/**
 * Use case for creating a new order in AWAITING_PAYMENT state.
 * The order is only forwarded (status SUBMITTED) once paymentService
 * confirms the payment — see HandlePaymentEvent.
 */
import { randomUUID } from 'crypto';
import { ExpeditionInfo, Order } from '../domain/entities/Order';
import { ValidationError } from '../domain/entities/errors';
import { OrderRepository } from '../domain/ports/OrderRepository';
import { CreateOrderInput, OrderDto, toOrderDto } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAP_RE = /^\d{4,10}$/;

const MAX_NAME_LENGTH = 100;
const MAX_MAIL_LENGTH = 254;
const MAX_LOCATION_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 200;
const MAX_PHONE_LENGTH = 30;
const MAX_DELIVERY_NOTES_LENGTH = 500;

export class CreateOrder {
  constructor(private readonly repo: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<OrderDto> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new ValidationError('items must contain at least one element');
    }
    const expeditionInfo = this.validateExpeditionInfo(input.expeditionInfo);
    if (!Number.isFinite(input.total) || input.total <= 0) {
      throw new ValidationError('total must be a positive number');
    }

    const now = new Date();
    const order: Order = {
      id: randomUUID(),
      userId: input.userId,
      expeditionInfo,
      items: input.items.map((item) => ({ ...item })),
      total: input.total,
      status: 'AWAITING_PAYMENT',
      submittedAt: now,
    };

    await this.repo.create(order);
    return toOrderDto(order);
  }

  private validateExpeditionInfo(input?: ExpeditionInfo): ExpeditionInfo {
    if (!input) {
      throw new ValidationError('expeditionInfo is required');
    }

    const name = this.requireTrimmed(input.name, 'expeditionInfo.name', MAX_NAME_LENGTH);
    const surname = this.requireTrimmed(input.surname, 'expeditionInfo.surname', MAX_NAME_LENGTH);
    const mail = this.requireTrimmed(input.mail, 'expeditionInfo.mail', MAX_MAIL_LENGTH);
    const nation = this.requireTrimmed(input.nation, 'expeditionInfo.nation', MAX_LOCATION_LENGTH);
    const city = this.requireTrimmed(input.city, 'expeditionInfo.city', MAX_LOCATION_LENGTH);
    const cap = this.requireTrimmed(input.cap, 'expeditionInfo.cap', 10);
    const address = this.requireTrimmed(input.address, 'expeditionInfo.address', MAX_ADDRESS_LENGTH);
    const phone = this.requireTrimmed(input.phone, 'expeditionInfo.phone', MAX_PHONE_LENGTH);
    const deliveryNotes = this.optionalTrimmed(
      input.deliveryNotes,
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
