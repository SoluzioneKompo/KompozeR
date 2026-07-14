import http from 'http';
import https from 'https';
import { URL } from 'url';
import { CatalogLookupError } from '../../domain/entities/errors';
import { CatalogQaItem, CatalogQaProvider } from '../../domain/ports/CatalogQaProvider';

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

  /** Performs a GET request and decodes the JSON payload. */
  private getJson<T>(url: URL): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        url,
        {
          method: 'GET',
          timeout: this.timeoutMs,
        },
        (res) => {
          const status = res.statusCode ?? 500;
          let raw = '';

          res.on('data', (chunk) => {
            raw += chunk.toString();
          });

          res.on('end', () => {
            if (status >= 400) {
              reject(new CatalogLookupError(`Catalog returned ${status}`));
              return;
            }

            try {
              resolve(JSON.parse(raw) as T);
            } catch {
              reject(new CatalogLookupError('Invalid JSON from catalog service'));
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new CatalogLookupError('Catalog request timed out'));
      });

      req.on('error', () => {
        reject(new CatalogLookupError('Catalog request failed'));
      });

      req.end();
    });
  }
}
