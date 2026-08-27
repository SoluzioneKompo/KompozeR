/**
 * HTTP adapter that submits checkout payloads to orderService.
 */
import { URL } from 'url';
import { OrderSubmissionError } from '../../domain/entities/errors';
import {
  OrderServiceClient,
  SubmitOrderInput,
  SubmitOrderOutput,
} from '../../domain/ports/OrderServiceClient';
import { HttpRequestFailure, requestJson } from './httpRetry';

type OrderApiResponse = {
  id?: string;
  status?: string;
  submittedAt?: string;
};

export class HttpOrderServiceClient implements OrderServiceClient {
  constructor(
    private readonly orderBaseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async submitOrder(input: SubmitOrderInput): Promise<SubmitOrderOutput> {
    const url = new URL('/orders', this.orderBaseUrl);
    const payload = JSON.stringify({
      expeditionInfo: input.expeditionInfo,
      items: input.items,
      total: input.total,
    });

    const response = await this.postJson<OrderApiResponse>(url, payload, input.userId);

    if (
      typeof response.id !== 'string' ||
      response.status !== 'SUBMITTED' ||
      typeof response.submittedAt !== 'string'
    ) {
      throw new OrderSubmissionError('Order service returned an invalid payload');
    }

    return {
      orderId: response.id,
      status: 'SUBMITTED',
      submittedAt: new Date(response.submittedAt),
    };
  }

  // POST /orders is NOT idempotent — a timeout or 5xx doesn't tell us
  // whether the order was actually created before the response was lost,
  // so only a connection that never reached the server (network failure)
  // is safe to retry automatically.
  private async postJson<T>(url: URL, payload: string, userId: string): Promise<T> {
    try {
      return await requestJson<T>(url, {
        method: 'POST',
        timeoutMs: this.timeoutMs,
        body: payload,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload)),
          'x-user-id': userId,
        },
        retryOnTimeout: false,
        retryOn5xx: false,
      });
    } catch (err) {
      if (err instanceof HttpRequestFailure) {
        if (err.kind === 'timeout') throw new OrderSubmissionError('Order service request timed out');
        if (err.kind === 'parse') throw new OrderSubmissionError('Invalid JSON from order service');
        if (err.kind === 'http') {
          throw new OrderSubmissionError(`Order service rejected request with status ${err.status}`);
        }
      }
      throw new OrderSubmissionError('Order service request failed');
    }
  }
}
