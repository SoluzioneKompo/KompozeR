/**
 * HTTP adapter that submits checkout payloads to orderService.
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { OrderSubmissionError } from '../../domain/entities/errors';
import {
  OrderServiceClient,
  SubmitOrderInput,
  SubmitOrderOutput,
} from '../../domain/ports/OrderServiceClient';

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

  private postJson<T>(url: URL, payload: string, userId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(
        url,
        {
          method: 'POST',
          timeout: this.timeoutMs,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
            'x-user-id': userId,
          },
        },
        (res) => {
          const status = res.statusCode ?? 500;
          let raw = '';

          res.on('data', (chunk) => {
            raw += chunk.toString();
          });

          res.on('end', () => {
            if (status >= 400) {
              reject(new OrderSubmissionError(`Order service rejected request with status ${status}`));
              return;
            }

            try {
              resolve(JSON.parse(raw) as T);
            } catch {
              reject(new OrderSubmissionError('Invalid JSON from order service'));
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new OrderSubmissionError('Order service request timed out'));
      });

      req.on('error', () => {
        reject(new OrderSubmissionError('Order service request failed'));
      });

      req.write(payload);
      req.end();
    });
  }
}
