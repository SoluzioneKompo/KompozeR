/**
 * Use case for retrieving a single order owned by the requesting user.
 */
import { ForbiddenError, OrderNotFoundError, ValidationError } from '../domain/entities/errors';
import { OrderRepository } from '../domain/ports/OrderRepository';
import { expireIfAbandoned } from './expireAbandonedOrder';
import { GetOrderInput, OrderDto, toOrderDto } from './types';

export class GetOrder {
  constructor(private readonly repo: OrderRepository) {}

  async execute(input: GetOrderInput): Promise<OrderDto> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.orderId?.trim()) {
      throw new ValidationError('orderId is required');
    }

    const order = await this.repo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }
    if (order.userId !== input.userId) {
      throw new ForbiddenError('Cannot access another user order');
    }

    const current = await expireIfAbandoned(order, this.repo);
    return toOrderDto(current);
  }
}
