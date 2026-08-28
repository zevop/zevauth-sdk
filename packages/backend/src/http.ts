import { ZevAuthError } from './errors.js';

export interface HttpOptions {
  apiUrl: string;
  secretKey: string;
  /** Swapped in tests. Defaults to the global. */
  fetch?: typeof fetch;
  /** Give up on one attempt after this long. */
  timeoutMs: number;
  /** How many times to retry a request that could not be answered. */
  maxRetries: number;
}

/**
 * The transport, with the two behaviours a server client needs and a
 * browser client does not.
 *
 * ── Retries ───────────────────────────────────────────────────────
 * A browser request that fails has a person watching who can press the
 * button again. A server request runs inside a webhook handler or a
 * nightly job with nobody watching, so a single dropped connection
 * becomes a user who was never provisioned.
 *
 * Only what is SAFE to repeat is repeated: a network failure, a timeout,
 * a 429, or a 5xx. Never a 4xx, which will fail identically forever, and
 * never a request whose response we actually read — a POST that returned
 * 500 may well have created something, so retrying it is how a developer
 * ends up with two of everything. That is why only 502/503/504 retry
 * among the 5xx: they mean a gateway never reached us.
 *
 * ── Timeouts ──────────────────────────────────────────────────────
 * `fetch` has no default timeout. Without one, a hung connection holds a
 * request handler open until something upstream gives up, which on a
 * busy server is how one slow dependency exhausts the pool.
 */
export class Http {
  constructor(private readonly options: HttpOptions) {}

  get<T>(path: string, query?: Record<string, string | number | undefined>) {
    return this.request<T>('GET', path + queryString(query));
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const doFetch = this.options.fetch ?? globalThis.fetch;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt));

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs,
      );

      try {
        const response = await doFetch(`${this.options.apiUrl}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.options.secretKey}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.status === 204) return undefined as T;

        const text = await response.text();
        const parsed = text ? safeJson(text) : undefined;

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < this.options.maxRetries) {
            lastError = errorFrom(response.status, parsed);
            continue;
          }
          throw errorFrom(response.status, parsed);
        }

        return parsed as T;
      } catch (err) {
        // A refusal is final. Only transport failures get another go.
        if (err instanceof ZevAuthError && !isRetryableStatus(err.status)) {
          throw err;
        }
        lastError = err;
        if (attempt === this.options.maxRetries) break;
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError instanceof ZevAuthError) throw lastError;
    throw new ZevAuthError(
      lastError instanceof Error
        ? `Could not reach ZevAuth: ${lastError.message}`
        : 'Could not reach ZevAuth.',
      'network_error',
      0,
    );
  }
}

/**
 * 502, 503 and 504 mean a gateway never reached us, so the request did
 * not happen and repeating it is safe. A bare 500 is excluded on
 * purpose: it means our code ran and failed, possibly after writing
 * something, and retrying it is how one `createUser` becomes two users.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/** Exponential, and capped. 200ms, 400ms, 800ms … */
function backoffMs(attempt: number): number {
  return Math.min(200 * 2 ** (attempt - 1), 4000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorFrom(status: number, body: unknown): ZevAuthError {
  const envelope = body as
    | { error?: { code?: string; message?: string }; message?: string }
    | undefined;

  return new ZevAuthError(
    envelope?.error?.message ??
      envelope?.message ??
      `ZevAuth returned ${status}.`,
    envelope?.error?.code ?? 'request_failed',
    status,
  );
}

function queryString(
  query?: Record<string, string | number | undefined>,
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}
