/**
 * Use case for listing orders.
 * ADMIN can list all orders, non-admin users list only owned orders.
 */
import { ValidationError } from '../domain/entities/errors';
import { OrderRepository } from '../domain/ports/OrderRepository';
import { expireIfAbandoned } from './expireAbandonedOrder';
import { ListOrdersInput, OrderDto, toOrderDto } from './types';

export interface ListOrdersOutput {
  items: OrderDto[];
}

export class ListOrders {
  constructor(private readonly repo: OrderRepository) {}

  async execute(input: ListOrdersInput): Promise<ListOrdersOutput> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }

    const isAdmin = typeof input.role === 'string' && input.role.toUpperCase() === 'ADMIN';
    const orders = isAdmin ? await this.repo.listAll() : await this.repo.listByUserId(input.userId);
    const current = await Promise.all(orders.map((order) => expireIfAbandoned(order, this.repo)));

    return {
      items: current.map(toOrderDto),
    };
  }
}
