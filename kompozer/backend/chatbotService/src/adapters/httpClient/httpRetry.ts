/**
 * Retrying JSON request helper over Node's http/https, shared by this
 * service's outbound HTTP adapters (calls to catalogService/cadService).
 *
 * Retries (up to `attempts`, default 3, with exponential backoff + jitter) on:
 * - connection-level failures (ECONNREFUSED, ENOTFOUND, ECONNRESET, ...) —
 *   the request never reached the server, always safe to retry regardless
 *   of HTTP method.
 * - request timeout — only when `retryOnTimeout` is true (default true).
 * - 5xx responses — only when `retryOn5xx` is true (default true).
 *
 * Never retries 4xx responses (client error, retrying won't help) or a
 * malformed JSON body (the server completed the request). All calls made
 * through this helper today are GET, so the defaults are safe everywhere
 * they're used.
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface HttpRetryOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  attempts?: number;
  retryOnTimeout?: boolean;
  retryOn5xx?: boolean;
}

export class HttpRequestFailure extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'parse',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpRequestFailure';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return 2 ** (attempt - 1) * 150 + Math.floor(Math.random() * 100);
}

function attemptOnce(url: URL, opts: HttpRetryOptions): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: opts.method,
        timeout: opts.timeoutMs,
        headers: opts.headers,
      },
      (res) => {
        const status = res.statusCode ?? 500;
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => resolve({ status, raw }));
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new HttpRequestFailure('Request timed out', 'timeout'));
    });

    req.on('error', () => {
      reject(new HttpRequestFailure('Request failed', 'network'));
    });

    if (opts.body !== undefined) {
      req.write(opts.body);
    }
    req.end();
  });
}

/** Performs a JSON HTTP request with bounded retry on transient failures. */
export async function requestJson<T>(url: URL, opts: HttpRetryOptions): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const retryOnTimeout = opts.retryOnTimeout ?? true;
  const retryOn5xx = opts.retryOn5xx ?? true;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const isLastAttempt = attempt === attempts;

    try {
      const { status, raw } = await attemptOnce(url, opts);

      if (status >= 500) {
        if (retryOn5xx && !isLastAttempt) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new HttpRequestFailure(`Request failed with status ${status}`, 'http', status);
      }
      if (status >= 400) {
        throw new HttpRequestFailure(`Request failed with status ${status}`, 'http', status);
      }

      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new HttpRequestFailure('Invalid JSON response', 'parse', status);
      }
    } catch (err) {
      if (!(err instanceof HttpRequestFailure) || err.kind === 'http' || err.kind === 'parse') {
        throw err;
      }
      const retryable = err.kind === 'network' || (err.kind === 'timeout' && retryOnTimeout);
      if (!retryable || isLastAttempt) {
        throw err;
      }
      await sleep(backoffMs(attempt));
    }
  }

  /* istanbul ignore next -- unreachable: loop always returns or throws */
  throw new HttpRequestFailure('Request failed', 'network');
}
