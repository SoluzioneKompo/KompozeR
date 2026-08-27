import { URL } from 'url';
import { Category } from '../../domain/entities/Category';
import { ResourceConflictError, ValidationError } from '../../domain/entities/errors';
import {
  CatalogComponentRule,
  CatalogComponentType,
  CatalogRules,
  CatalogRulesProvider,
} from '../../domain/ports/CatalogRulesProvider';
import { HttpRequestFailure, requestJson } from './httpRetry';

interface CatalogListItem {
  sku: unknown;
  name: unknown;
  price: unknown;
  Type: unknown;
  dimensions: {
    widthMm: unknown;
    heightMm: unknown;
    depthMm: unknown;
  };
}

interface CatalogListResponse {
  items: CatalogListItem[];
}

/**
 * HTTP adapter that loads catalog components and transforms them into CAD rules.
 */
export class HttpCatalogRulesProvider implements CatalogRulesProvider {
  constructor(
    private readonly catalogBaseUrl: string,
    private readonly timeoutMs = 3000,
  ) {}

  async getRules(category: Category): Promise<CatalogRules> {
    const url = new URL('/catalog', this.catalogBaseUrl);
    url.searchParams.set('category', category);
    url.searchParams.set('limit', '500');

    const data = await this.getJson<CatalogListResponse>(url);
    if (!data || !Array.isArray(data.items)) {
      throw new ResourceConflictError('Catalog response does not contain a valid items array');
    }

    const shelfByWidthMm = new Map<number, CatalogComponentRule>();
    const bordoByWidthMm = new Map<number, CatalogComponentRule>();
    const intermezzoByWidthMm = new Map<number, CatalogComponentRule>();
    const uprightByHeightMm = new Map<number, CatalogComponentRule>();
    const footByHeightMm = new Map<number, CatalogComponentRule>();
    const terminalHeightsMm: number[] = [];
    const footHeightsMm: number[] = [];
    const uprightHeightsMm: number[] = [];
    const footRules: CatalogComponentRule[] = [];
    const terminalRules: CatalogComponentRule[] = [];

    for (const item of data.items) {
      const type = this.parseType(item.Type);
      const widthMm = Number(item.dimensions?.widthMm);
      const heightMm = Number(item.dimensions?.heightMm);
      const depthMm = Number(item.dimensions?.depthMm);

      const hasInvalidHeight = Number.isNaN(heightMm) || !Number.isFinite(heightMm) || heightMm <= 0;
      const hasInvalidWidth = Number.isNaN(widthMm) || !Number.isFinite(widthMm);
      const hasInvalidDepth = Number.isNaN(depthMm) || !Number.isFinite(depthMm);
      if (hasInvalidHeight || hasInvalidWidth || hasInvalidDepth) {
        continue;
      }

      // RIPIANO, RIPIANO_BORDO, RIPIANO_INTERMEDIO and MENSOLA need physical width/depth.
      // Vertical parts can use 0 for width/depth in our catalog seed.
      if ((type === 'RIPIANO' || type === 'MENSOLA' || type === 'RIPIANO_BORDO' || type === 'RIPIANO_INTERMEDIO') && (widthMm <= 0 || depthMm <= 0)) {
        continue;
      }

      const sku = typeof item.sku === 'string' ? item.sku : String(item.sku ?? '');
      const name = typeof item.name === 'string' ? item.name : String(item.name ?? '');
      const priceCents = Number.isFinite(Number(item.price)) ? Number(item.price) : 0;

      const rule: CatalogComponentRule = {
        type,
        sku,
        name,
        priceCents,
        widthMm,
        heightMm,
        depthMm,
      };

      if (type === 'RIPIANO') {
        shelfByWidthMm.set(widthMm, rule);
      }
      if (type === 'RIPIANO_BORDO') {
        bordoByWidthMm.set(widthMm, rule);
      }
      if (type === 'RIPIANO_INTERMEDIO') {
        intermezzoByWidthMm.set(widthMm, rule);
      }
      if (type === 'TERMINALE') {
        terminalHeightsMm.push(heightMm);
        terminalRules.push(rule);
      }
      if (type === 'PIEDINO') {
        footHeightsMm.push(heightMm);
        footRules.push(rule);
        footByHeightMm.set(heightMm, rule);
      }
      if (type === 'MONTANTE') {
        uprightHeightsMm.push(heightMm);
        uprightByHeightMm.set(heightMm, rule);
      }
    }

    const sortedFeet = footRules.sort((a, b) => a.heightMm - b.heightMm);
    const sortedTerminals = terminalRules.sort((a, b) => a.heightMm - b.heightMm);

    return {
      shelfByWidthMm,
      bordoByWidthMm,
      intermezzoByWidthMm,
      uprightByHeightMm,
      footByHeightMm,
      terminalHeightsMm: uniqueSorted(terminalHeightsMm),
      footHeightsMm: uniqueSorted(footHeightsMm),
      uprightHeightsMm: uniqueSorted(uprightHeightsMm),
      defaultFoot: sortedFeet[0] ?? null,
      defaultTerminal: sortedTerminals[0] ?? null,
    };
  }

  private parseType(type: unknown): CatalogComponentType {
    if (
      type === 'PIEDINO' ||
      type === 'MONTANTE' ||
      type === 'RIPIANO' ||
      type === 'TERMINALE' ||
      type === 'MENSOLA' ||
      type === 'RIPIANO_BORDO' ||
      type === 'RIPIANO_INTERMEDIO'
    ) {
      return type;
    }

    throw new ValidationError('Catalog returned an unknown component type');
  }

  // GET is idempotent — safe to retry on timeout and 5xx as well as
  // connection errors.
  private async getJson<T>(url: URL): Promise<T> {
    try {
      return await requestJson<T>(url, { method: 'GET', timeoutMs: this.timeoutMs });
    } catch (err) {
      if (err instanceof HttpRequestFailure) {
        if (err.kind === 'timeout') throw new ResourceConflictError('Catalog request timed out');
        if (err.kind === 'parse') throw new ResourceConflictError('Catalog response is not valid JSON');
        if (err.kind === 'http') throw new ResourceConflictError(`Catalog request failed with status ${err.status}`);
      }
      throw new ResourceConflictError('Catalog request failed');
    }
  }
}

/** Returns sorted unique numeric values from an input list. */
function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
