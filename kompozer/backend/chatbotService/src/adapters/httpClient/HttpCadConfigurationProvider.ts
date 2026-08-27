import { URL } from 'url';
import { CadConfigurationProvider, CadConfigurationSnapshot } from '../../domain/ports/CadConfigurationProvider';
import { HttpRequestFailure, requestJson } from './httpRetry';

/** HTTP adapter that loads CAD configuration context for chatbot answers. */
type CadConfigurationResponse = {
  id?: string;
  status?: string;
  category?: string | null;
  environment?: {
    maxWidthMm?: number;
    maxHeightMm?: number;
  } | null;
  columnPlan?: {
    columnCount?: number;
  } | null;
  bom?: Array<unknown>;
};

/**
 * Retrieves a CAD configuration snapshot through the CAD service API.
 */
export class HttpCadConfigurationProvider implements CadConfigurationProvider {
  constructor(
    private readonly cadBaseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async getById(userId: string, configurationId: string): Promise<CadConfigurationSnapshot | null> {
    const url = new URL(`/cad/configurations/${encodeURIComponent(configurationId)}`, this.cadBaseUrl);

    const payload = await this.getJson<CadConfigurationResponse>(url, {
      'x-user-id': userId,
    });

    if (!payload || typeof payload.id !== 'string') {
      return null;
    }

    return {
      id: payload.id,
      status: typeof payload.status === 'string' ? payload.status : 'UNKNOWN',
      category: typeof payload.category === 'string' ? payload.category : null,
      columnCount:
        payload.columnPlan && typeof payload.columnPlan.columnCount === 'number'
          ? payload.columnPlan.columnCount
          : 0,
      maxWidthMm:
        payload.environment && typeof payload.environment.maxWidthMm === 'number'
          ? payload.environment.maxWidthMm
          : null,
      maxHeightMm:
        payload.environment && typeof payload.environment.maxHeightMm === 'number'
          ? payload.environment.maxHeightMm
          : null,
      componentCount: Array.isArray(payload.bom) ? payload.bom.length : 0,
    };
  }

  // GET is idempotent — safe to retry on timeout and 5xx as well as
  // connection errors. 404/403 are not transient (session isn't visible
  // to this user or doesn't exist) — resolved as null, not retried.
  private async getJson<T>(url: URL, headers: Record<string, string>): Promise<T> {
    try {
      return await requestJson<T>(url, { method: 'GET', timeoutMs: this.timeoutMs, headers });
    } catch (err) {
      if (err instanceof HttpRequestFailure) {
        if (err.kind === 'http' && (err.status === 404 || err.status === 403)) {
          return null as T;
        }
        if (err.kind === 'timeout') throw new Error('CAD request timed out');
        if (err.kind === 'parse') throw new Error('Invalid JSON from CAD service');
        if (err.kind === 'http') throw new Error(`CAD returned ${err.status}`);
      }
      throw err;
    }
  }
}
