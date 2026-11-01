/**
 * Builds the conformance fixtures every ZevAuth server SDK runs.
 *
 * ── Why fixtures, and not a test suite per language ───────────────
 * Six languages verifying the same token six slightly different ways is
 * six chances to accept one that should be refused. A single set of
 * inputs with a single set of expected answers means every SDK is held
 * to the same behaviour, and a disagreement shows up as a failing
 * fixture rather than as a customer finding it.
 *
 * ── Why the output is deterministic ───────────────────────────────
 * The keys are generated once and kept in `fixtures/keys/` (test keys,
 * worthless outside these files). RS256 signatures are deterministic,
 * timestamps come from the fixed `now` below, and nothing reads the
 * clock. Re-running this script produces byte-identical files, so a
 * diff in review means the fixtures really changed.
 *
 *   npx tsx spec/scripts/generate-fixtures.ts
 */
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SignJWT,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  importJWK,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from 'jose';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const keysDir = join(root, 'keys');

/** The instant every SDK sets its clock to when running these. */
export const NOW = 1_790_000_000;
const ENVIRONMENT = 'env_test_fixture';
const ISSUER = `https://api.zevauth.test/v1/${ENVIRONMENT}`;
const SKEW = 5;
const WEBHOOK_SECRET = 'whsec_fixture_secret_not_for_production_use';
const WEBHOOK_TOLERANCE = 300;

interface KeyPair {
  kid: string;
  privateKey: KeyLike;
  privateJwk: JWK;
  publicJwk: JWK;
}

async function loadOrCreateKey(kid: string): Promise<KeyPair> {
  const file = join(keysDir, `${kid}.private.json`);
  let privateJwk: JWK;
  if (existsSync(file)) {
    privateJwk = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true, modulusLength: 2048 });
    privateJwk = { ...(await exportJWK(privateKey)), kid, alg: 'RS256' };
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(file, JSON.stringify(privateJwk, null, 2) + '\n');
  }
  const privateKey = (await importJWK(privateJwk, 'RS256')) as KeyLike;
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = privateJwk;
  return { kid, privateKey, privateJwk, publicJwk: { ...pub, kid, alg: 'RS256', use: 'sig' } };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** The claims every real access token carries, before a case changes them. */
function baseClaims(extra: Record<string, unknown> = {}): JWTPayload {
  return {
    sid: 'sess_fixture_1',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada Lovelace',
    public_metadata: { plan: 'pro' },
    ...extra,
  };
}

async function sign(
  key: KeyPair,
  options: {
    claims?: Record<string, unknown>;
    iat?: number;
    nbf?: number;
    exp?: number;
    issuer?: string;
    audience?: string;
    alg?: string;
    sub?: string;
  } = {},
): Promise<string> {
  const iat = options.iat ?? NOW - 60;
  return new SignJWT(baseClaims(options.claims))
    .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: key.kid, typ: 'JWT' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? ENVIRONMENT)
    .setSubject(options.sub ?? 'user_fixture_1')
    .setIssuedAt(iat)
    .setNotBefore(options.nbf ?? iat)
    .setExpirationTime(options.exp ?? NOW + 840)
    .setJti(`jti_${options.sub ?? 'user_fixture_1'}_${options.exp ?? NOW + 840}`)
    .sign(
      // jose binds a key to one algorithm; the RS384 case re-imports it.
      options.alg && options.alg !== 'RS256'
        ? ((await importJWK({ ...key.privateJwk, alg: options.alg }, options.alg)) as KeyLike)
        : key.privateKey,
    );
}

function write(name: string, value: unknown): void {
  writeFileSync(join(root, name), JSON.stringify(value, null, 2) + '\n');
}

async function main(): Promise<void> {
  mkdirSync(root, { recursive: true });
  const a = await loadOrCreateKey('fixture_key_a');
  const b = await loadOrCreateKey('fixture_key_b');
  const outsider = await loadOrCreateKey('fixture_key_outsider');

  // ── Key sets ────────────────────────────────────────────────────
  write('jwks.json', { keys: [a.publicJwk] });
  write('jwks-rotated.json', { keys: [a.publicJwk, b.publicJwk] });
  write('discovery.json', {
    issuer: ISSUER,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    id_token_signing_alg_values_supported: ['RS256'],
    response_types_supported: [],
    subject_types_supported: ['public'],
  });

  const valid = await sign(a);
  const [validHeader, validPayload] = valid.split('.');

  // An HMAC "signature" keyed with the PUBLIC key's PEM: the classic
  // algorithm-confusion attack against a verifier that trusts `alg`.
  const pem = await exportSPKI((await importJWK(a.publicJwk, 'RS256')) as KeyLike);
  const hsHeader = base64url(JSON.stringify({ alg: 'HS256', kid: a.kid, typ: 'JWT' }));
  const hsSig = createHmac('sha256', pem).update(`${hsHeader}.${validPayload}`).digest('base64url');

  const noneHeader = base64url(JSON.stringify({ alg: 'none', kid: a.kid, typ: 'JWT' }));

  // The payload of a valid token with one claim changed, original signature kept.
  const tamperedPayload = base64url(
    JSON.stringify({ ...JSON.parse(Buffer.from(validPayload, 'base64url').toString()), sub: 'user_someone_else' }),
  );

  const org = {
    org_id: 'org_fixture_1',
    org_slug: 'acme',
    org_name: 'Acme',
    org_role: 'org:admin',
    org_permissions: ['org:members:manage', 'org:manage'],
  };

  /*
   * `expect.ok` false carries the error code every SDK reports; see
   * SERVER_SDK.md "Verification errors". `auth` is what getAuth must
   * produce, in the spec's language-neutral field names.
   */
  const cases = [
    {
      name: 'valid',
      description: 'A current token signed by the active key.',
      token: valid,
      jwks: 'jwks.json',
      expect: { ok: true },
      auth: { isSignedIn: true, userId: 'user_fixture_1', sessionId: 'sess_fixture_1', organizationId: null, organizationRole: null, pendingTasks: [], isMfaVerified: false },
    },
    {
      name: 'valid_with_organization',
      description: 'Organization claims are present only when the session acts in one.',
      token: await sign(a, { claims: org }),
      jwks: 'jwks.json',
      expect: { ok: true },
      auth: { isSignedIn: true, userId: 'user_fixture_1', sessionId: 'sess_fixture_1', organizationId: 'org_fixture_1', organizationRole: 'org:admin', pendingTasks: [], isMfaVerified: false },
      has: [
        { check: { permission: 'org:members:manage' }, result: true },
        { check: { role: 'org:admin' }, result: true },
        { check: { role: 'org:member' }, result: false },
        { check: { permission: 'org:billing:manage' }, result: false },
        { check: {}, result: false },
      ],
    },
    {
      name: 'valid_pending_task',
      description: 'Signed in, but must finish setting up two-step verification.',
      token: await sign(a, { claims: { pending_tasks: ['setup_mfa'] } }),
      jwks: 'jwks.json',
      expect: { ok: true },
      auth: { isSignedIn: true, userId: 'user_fixture_1', sessionId: 'sess_fixture_1', organizationId: null, organizationRole: null, pendingTasks: ['setup_mfa'], isMfaVerified: false },
      requireAuth: [
        { options: {}, result: { ok: false, status: 403, code: 'session_task_pending' } },
        { options: { allowPendingTasks: true }, result: { ok: true } },
      ],
    },
    {
      name: 'valid_mfa',
      description: 'A session that passed a second factor carries amr with "mfa".',
      token: await sign(a, { claims: { amr: ['pwd', 'mfa'] } }),
      jwks: 'jwks.json',
      expect: { ok: true },
      auth: { isSignedIn: true, userId: 'user_fixture_1', sessionId: 'sess_fixture_1', organizationId: null, organizationRole: null, pendingTasks: [], isMfaVerified: true },
      requireAuth: [{ options: { requireMfa: true }, result: { ok: true } }],
    },
    {
      name: 'valid_without_mfa_refused_by_require_mfa',
      description: 'requireMfa refuses a session with no second factor.',
      token: valid,
      jwks: 'jwks.json',
      expect: { ok: true },
      requireAuth: [{ options: { requireMfa: true }, result: { ok: false, status: 403, code: 'mfa_required' } }],
    },
    {
      name: 'expired_within_skew',
      description: `Expired ${SKEW - 2}s ago: inside the ${SKEW}s clock skew, so still accepted.`,
      token: await sign(a, { iat: NOW - 900, exp: NOW - (SKEW - 2) }),
      jwks: 'jwks.json',
      expect: { ok: true },
    },
    {
      name: 'expired',
      description: 'Expired beyond the clock skew.',
      token: await sign(a, { iat: NOW - 1000, exp: NOW - 60 }),
      jwks: 'jwks.json',
      expect: { ok: false, error: 'token_expired' },
      auth: { isSignedIn: false },
      requireAuth: [{ options: {}, result: { ok: false, status: 401, code: 'unauthorized' } }],
    },
    {
      name: 'not_yet_valid',
      description: 'nbf a minute in the future.',
      token: await sign(a, { iat: NOW, nbf: NOW + 60, exp: NOW + 900 }),
      jwks: 'jwks.json',
      expect: { ok: false, error: 'token_not_yet_valid' },
    },
    {
      name: 'alg_none',
      description: 'Unsigned token claiming alg "none". Must never verify.',
      token: `${noneHeader}.${validPayload}.`,
      jwks: 'jwks.json',
      expect: { ok: false, error: 'unsupported_algorithm' },
    },
    {
      name: 'alg_hs256_confusion',
      description: 'HMAC-signed with the public key as the secret. Must never verify.',
      token: `${hsHeader}.${validPayload}.${hsSig}`,
      jwks: 'jwks.json',
      expect: { ok: false, error: 'unsupported_algorithm' },
    },
    {
      name: 'alg_rs384',
      description: 'A real RSA signature, but not the one algorithm ZevAuth uses.',
      token: await sign(a, { alg: 'RS384' }),
      jwks: 'jwks.json',
      expect: { ok: false, error: 'unsupported_algorithm' },
    },
    {
      name: 'wrong_issuer',
      description: 'Signed by the right key, issued for another environment.',
      token: await sign(a, { issuer: 'https://api.zevauth.test/v1/env_live_other' }),
      jwks: 'jwks.json',
      expect: { ok: false, error: 'invalid_issuer' },
    },
    {
      name: 'wrong_audience',
      description: 'A token for a different environment (test token on a live route).',
      token: await sign(a, { audience: 'env_live_other' }),
      jwks: 'jwks.json',
      expect: { ok: false, error: 'invalid_audience' },
    },
    {
      name: 'unknown_kid',
      description: 'Signed by a key that is not, and never becomes, in the key set.',
      token: await sign(outsider),
      jwks: 'jwks.json',
      expect: { ok: false, error: 'unknown_key' },
    },
    {
      name: 'rotated_key',
      description:
        'Signed by a key published after the SDK cached jwks.json. The SDK must refetch once on the unknown kid, receive jwks-rotated.json, and accept.',
      token: await sign(b),
      jwks: 'jwks.json',
      jwksAfterRefetch: 'jwks-rotated.json',
      expect: { ok: true },
    },
    {
      name: 'tampered_payload',
      description: 'A claim changed after signing.',
      token: `${validHeader}.${tamperedPayload}.${valid.split('.')[2]}`,
      jwks: 'jwks.json',
      expect: { ok: false, error: 'invalid_signature' },
    },
    {
      name: 'malformed',
      description: 'Not three dot-separated parts.',
      token: `${validHeader}.${validPayload}`,
      jwks: 'jwks.json',
      expect: { ok: false, error: 'malformed_token' },
    },
  ];

  write('tokens.json', {
    now: NOW,
    environmentId: ENVIRONMENT,
    issuer: ISSUER,
    clockSkewSeconds: SKEW,
    cases,
  });

  // ── Bearer extraction ───────────────────────────────────────────
  write('bearer.json', {
    cases: [
      { header: `Bearer ${valid}`, token: valid },
      { header: `Bearer   ${valid}  `, token: valid },
      { header: valid, token: null, note: 'No scheme.' },
      { header: `Basic dXNlcjpwYXNz`, token: null },
      { header: 'Bearer ', token: null },
      { header: 'Bearer pk_test_abc', token: null, note: 'A publishable key, not a session token.' },
      { header: 'Bearer sk_live_abc', token: null, note: 'A secret key, not a session token.' },
      { header: null, token: null },
    ],
  });

  // ── Webhooks ────────────────────────────────────────────────────
  const payload = JSON.stringify({
    id: 'evt_fixture_1',
    type: 'user.created',
    createdAt: new Date(NOW * 1000).toISOString(),
    data: { id: 'user_fixture_1', email: 'ada@example.com' },
  });
  const macAt = (t: number, body: string, secret = WEBHOOK_SECRET) =>
    createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const header = (t: number, body = payload, secret = WEBHOOK_SECRET) => `t=${t},v1=${macAt(t, body, secret)}`;

  write('webhooks.json', {
    now: NOW,
    secret: WEBHOOK_SECRET,
    toleranceSeconds: WEBHOOK_TOLERANCE,
    headerName: 'zevauth-signature',
    cases: [
      { name: 'valid', payload, signature: header(NOW), valid: true },
      { name: 'valid_with_spaces', payload, signature: `t=${NOW}, v1=${macAt(NOW, payload)}`, valid: true },
      { name: 'valid_at_tolerance_edge', payload, signature: header(NOW - WEBHOOK_TOLERANCE), valid: true },
      { name: 'expired', payload, signature: header(NOW - WEBHOOK_TOLERANCE - 1), valid: false, error: 'webhook_timestamp_out_of_range' },
      { name: 'future', payload, signature: header(NOW + WEBHOOK_TOLERANCE + 1), valid: false, error: 'webhook_timestamp_out_of_range' },
      { name: 'tampered_body', payload: payload.replace('ada@', 'eve@'), signature: header(NOW), valid: false, error: 'webhook_signature_mismatch' },
      { name: 'reserialized_body', payload: JSON.stringify(JSON.parse(payload), null, 2), signature: header(NOW), valid: false, error: 'webhook_signature_mismatch', note: 'Verify the raw body bytes, never a re-encoded object.' },
      { name: 'wrong_secret', payload, signature: header(NOW, payload, 'whsec_someone_else'), valid: false, error: 'webhook_signature_mismatch' },
      { name: 'missing_timestamp', payload, signature: `v1=${macAt(NOW, payload)}`, valid: false, error: 'webhook_malformed_signature' },
      { name: 'missing_v1', payload, signature: `t=${NOW}`, valid: false, error: 'webhook_malformed_signature' },
      { name: 'empty', payload, signature: '', valid: false, error: 'webhook_malformed_signature' },
      { name: 'uppercase_hex', payload, signature: `t=${NOW},v1=${macAt(NOW, payload).toUpperCase()}`, valid: false, error: 'webhook_signature_mismatch', note: 'The signature is lowercase hex; compare it exactly.' },
    ],
  });

  // ── API errors, exactly as the server sends them ─────────────────
  write('api-errors.json', {
    cases: [
      {
        name: 'unauthorized',
        status: 401,
        headers: {},
        body: { error: { code: 'unauthorized', message: 'Invalid API key.' }, documentation: 'https://docs.zevauth.com' },
        expect: { code: 'unauthorized', status: 401, retry: false },
      },
      {
        name: 'not_found',
        status: 404,
        headers: {},
        body: { error: { code: 'not_found', message: 'No user with that id.' }, documentation: 'https://docs.zevauth.com' },
        expect: { code: 'not_found', status: 404, retry: false },
      },
      {
        name: 'domain_code',
        status: 403,
        headers: {},
        body: { error: { code: 'organization_permission_required', message: 'You need org:manage to do that.' } },
        expect: { code: 'organization_permission_required', status: 403, retry: false },
      },
      {
        name: 'validation',
        status: 400,
        headers: {},
        body: { error: { code: 'invalid_request', message: 'email must be an email. password is too short' } },
        expect: { code: 'invalid_request', status: 400, retry: false },
      },
      {
        name: 'rate_limited',
        status: 429,
        headers: { 'retry-after': '2' },
        body: { error: { code: 'rate_limited', message: 'Too many requests.' } },
        expect: { code: 'rate_limited', status: 429, retry: true, retryAfterSeconds: 2 },
      },
      {
        name: 'server_error',
        status: 500,
        headers: {},
        body: { error: { code: 'internal_error', message: 'An unexpected error occurred.' } },
        expect: { code: 'internal_error', status: 500, retry: false, note: 'The request may have run. Never retry a 500.' },
      },
      {
        name: 'bad_gateway',
        status: 502,
        headers: {},
        body: null,
        expect: { code: 'request_failed', status: 502, retry: true },
      },
      {
        name: 'unavailable_with_request_id',
        status: 503,
        headers: { 'x-request-id': 'req_fixture_1' },
        body: { error: { code: 'internal_error', message: 'Temporarily unavailable.' } },
        expect: { code: 'internal_error', status: 503, retry: true, requestId: 'req_fixture_1' },
      },
      {
        name: 'not_json',
        status: 504,
        headers: {},
        bodyText: '<html>Gateway Timeout</html>',
        expect: { code: 'request_failed', status: 504, retry: true },
      },
    ],
  });

  // ── Session bridge requests ─────────────────────────────────────
  write('bridge.json', {
    now: NOW,
    environmentId: ENVIRONMENT,
    appOrigin: 'https://app.example.com',
    header: { name: 'x-zevauth-bridge', value: '1' },
    cases: [
      {
        name: 'set',
        request: { method: 'POST', origin: 'https://app.example.com', bridgeHeader: true, body: { token: valid } },
        expect: { status: 204, cookie: 'set', maxAgeSeconds: 840 },
      },
      {
        name: 'clear',
        request: { method: 'POST', origin: 'https://app.example.com', bridgeHeader: true, body: { token: null } },
        expect: { status: 204, cookie: 'cleared' },
      },
      {
        name: 'missing_header',
        request: { method: 'POST', origin: 'https://app.example.com', bridgeHeader: false, body: { token: valid } },
        expect: { status: 403, code: 'bridge_header_missing', cookie: 'unchanged' },
      },
      {
        name: 'foreign_origin',
        request: { method: 'POST', origin: 'https://evil.example', bridgeHeader: true, body: { token: valid } },
        expect: { status: 403, code: 'bridge_origin_not_allowed', cookie: 'unchanged' },
      },
      {
        name: 'invalid_token',
        request: { method: 'POST', origin: 'https://app.example.com', bridgeHeader: true, body: { token: `${validHeader}.${tamperedPayload}.${valid.split('.')[2]}` } },
        expect: { status: 401, code: 'unauthorized', cookie: 'cleared' },
      },
      {
        name: 'wrong_method',
        request: { method: 'GET', origin: 'https://app.example.com', bridgeHeader: true },
        expect: { status: 405, cookie: 'unchanged' },
      },
    ],
  });

  console.log(`Fixtures written to ${root}`);
}

void main();
