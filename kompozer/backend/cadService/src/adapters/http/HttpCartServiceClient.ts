import { URL } from 'url';
import { BomItem } from '../../domain/entities/Bom';
import { ResourceConflictError } from '../../domain/entities/errors';
import { CartServiceClient } from '../../domain/ports/CartServiceClient';
import { HttpRequestFailure, requestJson } from './httpRetry';

/** HTTP adapter for pushing derived BOM items into cart service endpoints. */
export class HttpCartServiceClient implements CartServiceClient {
  constructor(
    private readonly cartBaseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async pushBomToCart(ownerId: string, items: BomItem[], configId: string, configName: string): Promise<void> {
    for (const item of items) {
      await this.upsertItem(ownerId, item, configId, configName);
    }
  }

  // PUT .../items/:sku is an upsert — idempotent, safe to retry on
  // timeout and 5xx as well as connection errors.
  private async upsertItem(ownerId: string, item: BomItem, configId: string, configName: string): Promise<void> {
    const url = new URL(`/cart/items/${encodeURIComponent(item.sku)}`, this.cartBaseUrl);
    const body = JSON.stringify({
      name: item.name,
      unitPrice: item.unitPriceCents,
      quantity: item.quantity,
      configId,
      configName,
    });

    try {
      await requestJson<unknown>(url, {
        method: 'PUT',
        timeoutMs: this.timeoutMs,
        body,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
          'x-user-id': ownerId,
        },
      });
    } catch (err) {
      if (err instanceof HttpRequestFailure) {
        if (err.kind === 'timeout') throw new ResourceConflictError('Cart service request timed out');
        if (err.kind === 'http') {
          throw new ResourceConflictError(`Cart service rejected item ${item.sku} with status ${err.status}`);
        }
        // 'parse' — cart returns the updated cart on success; a malformed
        // body still means the item was applied, so treat it like the
        // other transport failures rather than surfacing a JSON-specific error.
      }
      throw new ResourceConflictError('Cart service request failed');
    }
  }
}
