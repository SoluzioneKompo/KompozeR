/**
 * HTTP adapter that fetches product availability/price snapshots from catalogService.
 */
import { URL } from 'url';
import { CatalogLookupError } from '../../domain/entities/errors';
import { CatalogItemSnapshot, CatalogSnapshotProvider } from '../../domain/ports/CatalogSnapshotProvider';
import { HttpRequestFailure, requestJson } from './httpRetry';

type CatalogListResponse = {
  items?: Array<{
    sku?: string;
    price?: number;
    isAvailable?: boolean;
  }>;
};

export class HttpCatalogSnapshotProvider implements CatalogSnapshotProvider {
  constructor(
    private readonly catalogBaseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async getBySku(sku: string): Promise<CatalogItemSnapshot | null> {
    const encoded = encodeURIComponent(sku);
    const url = new URL(`/catalog?search=${encoded}&limit=100`, this.catalogBaseUrl);

    const payload = await this.getJson<CatalogListResponse>(url);
    const items = payload.items ?? [];
    const match = items.find((i) => i.sku === sku);
    if (!match || typeof match.price !== 'number' || typeof match.isAvailable !== 'boolean') {
      return null;
    }

    return {
      sku,
      unitPrice: match.price,
      isAvailable: match.isAvailable,
    };
  }

  // GET is idempotent — safe to retry on timeout and 5xx as well as
  // connection errors.
  private async getJson<T>(url: URL): Promise<T> {
    try {
      return await requestJson<T>(url, { method: 'GET', timeoutMs: this.timeoutMs });
    } catch (err) {
      if (err instanceof HttpRequestFailure) {
        if (err.kind === 'timeout') throw new CatalogLookupError('Catalog request timed out');
        if (err.kind === 'parse') throw new CatalogLookupError('Invalid JSON from catalog service');
        if (err.kind === 'http') throw new CatalogLookupError(`Catalog returned ${err.status}`);
      }
      throw new CatalogLookupError('Catalog request failed');
    }
  }
}
