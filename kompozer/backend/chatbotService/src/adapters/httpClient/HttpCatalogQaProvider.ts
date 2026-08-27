import { URL } from 'url';
import { CatalogLookupError } from '../../domain/entities/errors';
import { CatalogQaItem, CatalogQaProvider } from '../../domain/ports/CatalogQaProvider';
import { HttpRequestFailure, requestJson } from './httpRetry';

/** HTTP adapter that queries catalog search results for chatbot answers. */
type CatalogListResponse = {
  items?: Array<{
    id?: string;
    sku?: string;
    name?: string;
    price?: number;
    isAvailable?: boolean;
  }>;
};

/**
 * Retrieves and normalizes catalog QA results from the catalog service.
 */
export class HttpCatalogQaProvider implements CatalogQaProvider {
  constructor(
    private readonly catalogBaseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async search(query: string): Promise<CatalogQaItem[]> {
    const encoded = encodeURIComponent(query);
    const url = new URL(`/catalog?search=${encoded}&limit=10`, this.catalogBaseUrl);

    const payload = await this.getJson<CatalogListResponse>(url);
    const items = payload.items ?? [];

    return items
      .filter(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.sku === 'string' &&
          typeof item.name === 'string' &&
          typeof item.price === 'number' &&
          typeof item.isAvailable === 'boolean',
      )
      .map((item) => ({
        id: item.id as string,
        sku: item.sku as string,
        name: item.name as string,
        price: item.price as number,
        isAvailable: item.isAvailable as boolean,
      }));
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
