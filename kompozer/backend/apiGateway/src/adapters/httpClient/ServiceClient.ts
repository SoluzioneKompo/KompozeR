/**
 * Injectable HTTP client adapter used by gateway BFF routes.
 *
 * Creates an Axios client configured with:
 * - downstream service base URL,
 * - 5-second timeout,
 * - forwarded identity headers from JWT middleware.
 *
 * All calls made through this client are GET (read-only aggregation for the
 * BFF), so a blanket retry policy is safe: up to 3 attempts, retrying on
 * network errors, timeouts, and 5xx responses, but never on 4xx (the
 * downstream service already told us the request itself is wrong).
 *
 * The HttpClient abstraction remains intentionally small to simplify tests.
 */
declare const require: (moduleName: string) => unknown;

type AxiosResponse<T = unknown> = { data: T };
type AxiosClient = { get<T = unknown>(path: string): Promise<AxiosResponse<T>> };
type AxiosFactory = {
  create: (config: {
    baseURL: string;
    timeout: number;
    headers: Record<string, string | undefined>;
  }) => AxiosClient;
};

const axios = require('axios') as AxiosFactory;

export interface IdentityHeaders {
  'x-user-id'?: string;
  'x-user-role'?: string;
  'x-session-id'?: string;
}

export interface HttpClient {
  get<T = unknown>(path: string): Promise<T>;
}

interface AxiosErrorLike {
  response?: { status: number };
}

function isRetryable(err: unknown): boolean {
  const response = (err as AxiosErrorLike)?.response;
  // No response at all -> network error/timeout/DNS failure, always retryable.
  // A response was received -> retry only on 5xx, never on 4xx.
  return response ? response.status >= 500 : true;
}

function backoffMs(attempt: number): number {
  return 2 ** (attempt - 1) * 150 + Math.floor(Math.random() * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWithRetry<T>(instance: AxiosClient, path: string, attempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await instance.get<T>(path);
      return res.data;
    } catch (err) {
      if (attempt === attempts || !isRetryable(err)) {
        throw err;
      }
      await sleep(backoffMs(attempt));
    }
  }
  /* istanbul ignore next -- unreachable: loop always returns or throws */
  throw new Error('unreachable');
}

/**
 * Creates a per-request service client that preserves caller identity context.
 */
export function createServiceClient(baseUrl: string, identity: IdentityHeaders): HttpClient {
  const instance = axios.create({
    baseURL: baseUrl,
    timeout: 5_000,
    headers: {
      'x-user-id': identity['x-user-id'],
      'x-user-role': identity['x-user-role'],
      'x-session-id': identity['x-session-id'],
    },
  });

  return {
    get<T = unknown>(path: string): Promise<T> {
      return getWithRetry<T>(instance, path);
    },
  };
}
