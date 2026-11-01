/**
 * Verifying a ZevAuth webhook before acting on it.
 *
 * A webhook endpoint is a public URL. Without this check, anybody who
 * learns it can post `user.deleted` for any user and watch the receiver
 * delete them. The signature proves the body came from ZevAuth, and the
 * timestamp inside it stops a captured delivery being replayed later.
 *
 * Web Crypto rather than `node:crypto`, so this runs unchanged on Node,
 * Deno, Bun, Cloudflare Workers and the Edge runtime.
 *
 * ── The raw body, always ──────────────────────────────────────────
 * The signature covers the exact bytes ZevAuth sent. A body parsed and
 * re-serialised (key order, spacing, unicode escapes) is a different
 * string and fails, which is correct: verify first, parse after. In
 * Express that means `express.raw({ type: 'application/json' })` on the
 * webhook route; with a `Request`, `await request.text()`.
 */

export type WebhookErrorCode =
  | 'webhook_malformed_signature'
  | 'webhook_timestamp_out_of_range'
  | 'webhook_signature_mismatch';

export class ZevAuthWebhookError extends Error {
  constructor(
    message: string,
    readonly code: WebhookErrorCode,
  ) {
    super(message);
    this.name = 'ZevAuthWebhookError';
  }
}

export interface VerifyWebhookParams {
  /** The raw request body, exactly as received. */
  payload: string;
  /** The `zevauth-signature` header: `t=<unix>,v1=<hex>`. */
  signature: string | null | undefined;
  /** The endpoint's signing secret, `whsec_…`, from the console. */
  secret: string;
  /** Oldest (and furthest-future) delivery accepted. Defaults to 300 s. */
  toleranceSeconds?: number;
  /** Seconds since the epoch. For tests; defaults to now. */
  now?: number;
}

export interface ZevAuthWebhookEvent<T = unknown> {
  id: string;
  type: string;
  createdAt: string;
  data: T;
}

/** Throws `ZevAuthWebhookError` unless the delivery is genuine and recent. */
export async function verifyWebhook(params: VerifyWebhookParams): Promise<void> {
  const parts = new Map<string, string>();
  for (const piece of (params.signature ?? '').split(',')) {
    const at = piece.indexOf('=');
    if (at > 0) parts.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
  }

  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1');
  if (!Number.isInteger(timestamp) || timestamp <= 0 || !provided) {
    throw new ZevAuthWebhookError(
      'The zevauth-signature header is missing or not in the form t=<timestamp>,v1=<signature>.',
      'webhook_malformed_signature',
    );
  }

  const now = params.now ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? 300;
  if (Math.abs(now - timestamp) > tolerance) {
    throw new ZevAuthWebhookError(
      `The delivery is ${Math.abs(now - timestamp)}s from now; at most ${tolerance}s is accepted. Check the server clock, or this is a replay.`,
      'webhook_timestamp_out_of_range',
    );
  }

  const expected = await hmacHex(params.secret, `${timestamp}.${params.payload}`);
  if (!constantTimeEqual(expected, provided)) {
    throw new ZevAuthWebhookError(
      'The signature does not match. Check the endpoint secret, and that you verify the raw body, not a re-encoded one.',
      'webhook_signature_mismatch',
    );
  }
}

/** Verifies, then parses. The usual way to receive a webhook. */
export async function constructWebhookEvent<T = unknown>(
  params: VerifyWebhookParams,
): Promise<ZevAuthWebhookEvent<T>> {
  await verifyWebhook(params);
  return JSON.parse(params.payload) as ZevAuthWebhookEvent<T>;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares every character whatever the answer, so how long the check
 * takes says nothing about how much of a guess was right.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
