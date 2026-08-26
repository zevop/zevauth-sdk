import { ZevAuthError } from '../types';

export interface HttpOptions {
  baseUrl: string;
  publishableKey: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Every request the SDK makes.
 *
 * ── Why errors are normalised here ────────────────────────────────
 * The API answers with `{ error: { code, message } }` and the messages
 * are written for people. Every call site would otherwise re-derive
 * "what do I show the user", and they would disagree. One shape in, one
 * `ZevAuthError` out, with the server's own code preserved so an
 * application can branch on `err.code` rather than matching on English.
 */
export class Http {
  private readonly doFetch: typeof globalThis.fetch;

  /** The API root. Exposed so redirect flows can build absolute URLs. */
  readonly baseUrl: string;

  constructor(private readonly options: HttpOptions) {
    this.baseUrl = options.baseUrl;
    /*
     * Bound to `globalThis`. Extracting `fetch` from the global and
     * calling it unbound throws "Illegal invocation" in browsers, which
     * is a confusing first error for anybody passing a custom fetch.
     */
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async post<T>(
    path: string,
    body?: unknown,
    init: { accessToken?: string | null } = {},
  ): Promise<T> {
    return this.send<T>('POST', path, body, init);
  }

  async get<T>(
    path: string,
    init: { accessToken?: string | null } = {},
  ): Promise<T> {
    return this.send<T>('GET', path, undefined, init);
  }

  private async send<T>(
    method: string,
    path: string,
    body: unknown,
    init: { accessToken?: string | null },
  ): Promise<T> {
    let response: Response;

    try {
      response = await this.doFetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: {
          /*
           * The publishable key identifies the environment. It is not a
           * secret — it ships in the bundle — which is why the API locks
           * it to the developer's verified origin.
           */
          Authorization: `Bearer ${init.accessToken ?? this.options.publishableKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      // A network failure is not an auth failure, and treating it as one
      // sends people to reset passwords that were never wrong.
      throw new ZevAuthError(
        'Could not reach the server. Check your connection.',
        'network_error',
        0,
      );
    }

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const error = payload.error as
        | { code?: string; message?: string }
        | undefined;
      throw new ZevAuthError(
        error?.message ?? 'Something went wrong. Please try again.',
        error?.code ?? 'request_failed',
        response.status,
      );
    }

    return payload as T;
  }
}
