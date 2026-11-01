# ZevAuth server SDK contract

Every ZevAuth server SDK implements this document: Node (`@zevauth/backend`),
PHP, Python, Ruby, Go and Java. A developer moving between languages
should meet the same behaviour, the same error codes and the same
defaults, spelled the way their language spells things.

The fixtures in [`fixtures/`](./fixtures) are the executable half of this
contract. **An SDK conforms when it passes every fixture.** Where this
document and a fixture disagree, the fixture is wrong and is fixed here
first.

Source of truth for the server's behaviour: `zevauth-backend`
(`sessions.service.ts` mints tokens, `jwks.controller.ts` publishes keys,
`webhooks.service.ts` signs deliveries, `all-exceptions.filter.ts` shapes
errors). This document describes what those do; it does not invent.

---

## 1. Session tokens

### 1.1 What a token is

An access token is a JWT, signed with **RS256** by the environment's own
key, valid for minutes. It is minted by the server and refreshed only by
the browser or mobile SDK. A server SDK only ever **verifies** tokens; it
never mints or refreshes one (§5 explains why).

| Header | Value |
| --- | --- |
| `alg` | `RS256`, always |
| `kid` | The signing key's id, found in the JWKS |
| `typ` | `JWT` |

| Claim | Type | Always | Meaning |
| --- | --- | --- | --- |
| `iss` | string | yes | `{issuerBase}/v1/{environmentId}`, from the discovery document |
| `aud` | string | yes | The environment's public id, `env_test_…` / `env_live_…` |
| `sub` | string | yes | The end user's public id |
| `sid` | string | yes | The session's public id (revocable) |
| `iat`, `nbf`, `exp` | number | yes | Seconds since the epoch |
| `jti` | string | yes | Unique token id |
| `email` | string | no | Absent when the user has none |
| `email_verified` | boolean | yes | |
| `name`, `picture` | string | no | |
| `public_metadata` | object | yes | The developer's public metadata. Private metadata is never in a token |
| `org_id`, `org_slug`, `org_name`, `org_role` | string | no | Present only when the session acts in an organization |
| `org_permissions` | string[] | no | As above |
| `pending_tasks` | string[] | no | Absent when empty. Today only `setup_mfa` |
| `amr` | string[] | no | RFC 8176. Present only on sessions that passed a second factor, and then contains `mfa` |

Absent means absent: claims are omitted, never sent as `null`. An SDK
reads an absent list as empty and an absent string as null/none.

### 1.2 Discovery and keys

```
GET {apiUrl}/v1/{environmentId}/.well-known/openid-configuration
  → { issuer, jwks_uri, id_token_signing_alg_values_supported: ["RS256"], … }
GET {jwks_uri}                       (Cache-Control: max-age=300)
  → { keys: [ { kty: "RSA", kid, alg: "RS256", use: "sig", n, e } ] }
```

- Default `apiUrl`: `https://api.zevauth.net`. Configurable.
- **Read the issuer from discovery.** Never build it from `apiUrl`: they
  are allowed to differ (self-hosting, local development).
- Discovery is fetched once per process per `(apiUrl, environmentId)` and
  cached for the life of the process. A failed fetch is not cached.
- The key set is cached for at most **10 minutes**.
- **Rotation:** a token whose `kid` is not in the cached set triggers one
  refetch, then a retry against the new set. Refetches caused by unknown
  `kid`s happen **at most once per 30 seconds** (the cooldown), so a token
  with a made-up `kid` cannot make the SDK fetch on every request.
- Concurrent first requests share one in-flight fetch.
- An SDK accepts a **local key set** (plus an explicit issuer) instead of
  fetching, for tests and air-gapped servers.

### 1.3 Verification

In this order, with the outcome named by the code in §1.4:

1. Three base64url segments, valid JSON header and payload, else `malformed_token`.
2. `alg` must be exactly `RS256`. `none`, `HS256` (the key-confusion
   attack), `RS384` and anything else are refused before any key is
   looked at: `unsupported_algorithm`. Never let the token choose the algorithm.
3. Find the key by `kid` (with the rotation rule above), else `unknown_key`.
4. Verify the signature, else `invalid_signature`.
5. `iss` equals the discovered issuer, else `invalid_issuer`.
6. `aud` equals the configured environment id, else `invalid_audience`.
   This is not optional: it is what stops a test token working on a live route.
7. `exp` and `nbf` with **5 seconds** of clock skew, configurable:
   `token_expired`, `token_not_yet_valid`.

The clock is injectable, so tests (and the fixtures) can fix "now".

### 1.4 Verification errors

| Code | When |
| --- | --- |
| `malformed_token` | Not a JWT, or a claim of the wrong type |
| `unsupported_algorithm` | Any `alg` other than `RS256` |
| `unknown_key` | No key with that `kid`, even after a refetch |
| `invalid_signature` | Signature does not verify |
| `invalid_issuer` | Wrong `iss` |
| `invalid_audience` | Wrong `aud` (another environment) |
| `token_expired` | Past `exp` + skew |
| `token_not_yet_valid` | Before `nbf` − skew |
| `jwks_unavailable` | Discovery or key set could not be fetched |

The low-level verify function raises/throws/returns these. `getAuth`
(§2) turns every one into "signed out" and never raises.

### 1.5 Bearer extraction

From `Authorization: Bearer <token>`: the scheme is case-sensitive
`Bearer `, surrounding whitespace is trimmed, an empty token is none, and
a value starting `pk_` or `sk_` is none (an API key in the wrong place,
not a session). See `fixtures/bearer.json`.

---

## 2. getAuth and requireAuth

### 2.1 The auth object

Language-neutral names; each SDK uses its idiom (`user_id` in Python and
Ruby, `userId` in Node and Java, `UserID` in Go, `userId` in PHP).

| Field | Type | Signed out |
| --- | --- | --- |
| `isSignedIn` | bool | false |
| `userId` | string? | null |
| `sessionId` | string? | null |
| `organizationId` | string? | null |
| `organizationRole` | string? | null |
| `claims` | map? | null (all verified claims) |
| `pendingTasks` | string[] | [] |
| `isMfaVerified` | bool | false (`amr` contains `mfa`) |
| `has({ role?, permission? })` | bool | false |

`has`: false with no active organization; false when neither `role` nor
`permission` is given; otherwise true only when every given one matches
(`org_role` equals `role`, `org_permissions` contains `permission`).

### 2.2 getAuth(request)

Reads the `Authorization` header, then (when the session bridge is
configured) the bridge cookie (§5). Verifies. Returns the auth object.
**Never raises** for a missing, expired or bad token: those all mean
"nobody is signed in", and a page deciding what to render must not crash
because a session lapsed. It may raise for misconfiguration (no
environment id).

### 2.3 requireAuth(request, options)

The same, but refuses. Options:

| Option | Default | Effect |
| --- | --- | --- |
| `allowPendingTasks` | false | Serve a session with pending tasks. Only for routes that help finish the task |
| `requireMfa` | false | Refuse unless `isMfaVerified` |

Refusals, checked in this order, with the HTTP response each framework
integration produces:

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthorized` | Not signed in |
| 403 | `session_task_pending` | `pendingTasks` non-empty and not allowed. Body adds `pendingTasks` |
| 403 | `mfa_required` | `requireMfa` and not verified |

Body shape: `{ "error": { "code": "…", "message": "…" } }`, the same
envelope the ZevAuth API uses. How the refusal is delivered is idiomatic:
a thrown `Response` in Node, an exception the framework turns into a
response elsewhere (`HttpException` in Laravel, `PermissionDenied` /
`HTTPException` in Django and FastAPI, a halted Rack response, an
`http.Handler` that writes it in Go, a Spring `ResponseStatusException`).

`session_task_pending` is never produced for a token without the claim,
so code written before MFA existed behaves exactly as it did.

---

## 3. Backend API client

### 3.1 Construction

- Requires a **secret key** (`sk_test_…` / `sk_live_…`). Refuse a
  publishable key (`pk_…`) at construction with `wrong_key_type`, and an
  empty one with `missing_secret_key`.
- Options: `apiUrl` (default `https://api.zevauth.net`), timeout (default
  **15 s** per attempt), max retries (default **2**), an injectable HTTP
  client for tests.
- Headers: `Authorization: Bearer <secret>`, `Content-Type:
  application/json`, `User-Agent: zevauth-<lang>/<version>`
  (`zevauth-node`, `zevauth-php`, `zevauth-python`, `zevauth-ruby`,
  `zevauth-go`, `zevauth-java`).

### 3.2 Resources

| Method | Route | Notes |
| --- | --- | --- |
| `users.list({ limit?, after?, query?, metadata? })` | `GET /v1/users` | `metadata[key]=value`, ANDed |
| `users.get(id)` | `GET /v1/users/:id` | |
| `users.create(params)` | `POST /v1/users` | |
| `users.update(id, params)` | `PATCH /v1/users/:id` | |
| `users.setBlocked(id, blocked)` | `POST /v1/users/:id/blocked` | Returns `{ user, sessionsRevoked }` |
| `users.revokeSessions(id)` | `POST /v1/users/:id/sessions/revoke` | Returns `{ sessionsRevoked }` |
| `users.resetMfa(id, { revokeSessions? })` | `DELETE /v1/users/:id/mfa?revokeSessions=` | `revokeSessions` defaults to false |
| `users.delete(id)` | `DELETE /v1/users/:id` | |
| `organizations.listForUser(userId)` | `GET /v1/organizations?userId=` | |
| `organizations.get(id)` | `GET /v1/organizations/:id` | |
| `organizations.create(params)` | `POST /v1/organizations` | |
| `organizations.update(id, params)` | `PATCH /v1/organizations/:id` | includes `requireMfa` |
| `organizations.delete(id)` | `DELETE /v1/organizations/:id` | |
| `organizations.addMember(id, { userId, role? })` | `POST /v1/organizations/:id/members` | |
| `organizations.removeMember(id, userId)` | `DELETE /v1/organizations/:id/members/:userId` | |

Ids are URL-encoded into paths. Fields keep the API's camelCase on the
wire; SDKs may expose idiomatic names but must not rename on the wire.

### 3.3 Pagination

List responses: `{ data: [...], hasMore, next, totalCount }`. `next` is the
cursor for `after`. SDKs offer the page as returned, and an idiomatic
auto-paginating iterator (`for await` in Node, a generator in PHP and
Python, `each` in Ruby, an iterator in Go and Java) that follows `next`
until `hasMore` is false.

### 3.4 Errors

The API answers failures with
`{ "error": { "code": "…", "message": "…" }, "documentation"?: "…" }`.
Default codes by status: 400 `invalid_request`, 401 `unauthorized`, 403
`forbidden`, 404 `not_found`, 409 `conflict`, 429 `rate_limited`, 5xx
`internal_error`. Domain codes (`organization_permission_required`,
`email_not_verified`, …) replace the default when the server sends one.

An SDK error carries `code`, `status`, `message`, and `requestId` from the
`x-request-id` response header when present. A body that is not JSON, or
has no code, yields `request_failed`. A transport failure (DNS, refused,
timeout) yields `network_error` with status 0.

### 3.5 Retries

Retry only what certainly did not run:

- **Retry:** 429, 502, 503, 504, and transport failures.
- **Never retry:** any other 4xx, and **500** (the server ran and failed,
  possibly after writing: retrying is how one `createUser` becomes two).
- Wait `Retry-After` seconds when the response has it (capped at 10 s),
  otherwise exponential backoff: 200 ms, 400 ms, 800 ms …, capped at 4 s.
- At most `maxRetries` retries.

`Idempotency-Key` is not honoured by the API today. SDKs must not send
one or rely on it until this document says otherwise.

---

## 4. Webhooks

Deliveries are `POST` with:

| Header | Value |
| --- | --- |
| `zevauth-signature` | `t=<unix seconds>,v1=<lowercase hex HMAC-SHA256>` |
| `zevauth-event-type` | e.g. `user.created` |
| `zevauth-delivery-id` | Stable across retries of one delivery |
| `zevauth-attempt` | 1, 2, … |

Verification:

1. Split the header on `,`, each part on its first `=`, trimming
   whitespace. Missing `t` or `v1`, or a non-integer `t`:
   `webhook_malformed_signature`.
2. `|now − t| ≤ tolerance` (default **300 s**), else
   `webhook_timestamp_out_of_range`. This rejects replays and futures alike.
3. `expected = hex(HMAC_SHA256(key = secret, message = "<t>.<raw body>"))`.
   The key is the whole secret string **including** its `whsec_` prefix.
4. Compare `expected` and `v1` in **constant time**, exactly (no case
   folding), else `webhook_signature_mismatch`.

**The raw body.** The signature covers the exact bytes received. Verify
before parsing; a body parsed and re-serialised fails, correctly. Every
SDK's docs show how to get the raw body in its frameworks.

API: `verifyWebhook({ payload, signature, secret, toleranceSeconds?, now? })`
raises with one of the three codes, and `constructWebhookEvent(...)`
verifies then returns the parsed event `{ id, type, createdAt, data }`.
Deliveries are at-least-once: handlers use `zevauth-delivery-id` (or the
event `id`) to stay idempotent.

---

## 5. Session bridge

For server-rendered apps, where the browser requests pages itself and
sends no `Authorization` header.

### 5.1 Why the server never refreshes

Refresh tokens rotate on every use, and ZevAuth treats a refresh token
used twice as stolen: it ends the whole session. There is no grace
window. A server refreshing alongside the browser would race it and sign
the person out. So **the refresh token never leaves the browser**, only
the browser refreshes, and only access tokens cross to the server.

### 5.2 Browser side

The browser SDK option `sessionBridge: { url }` (in `@zevauth/js` and
passed through by the React provider, `@zevauth/ui` and the Vue plugin):

- On every access-token change (sign-in, refresh, organization switch,
  sign-out) it posts `POST {url}` with body `{ "token": "<jwt>" }` or
  `{ "token": null }` on sign-out.
- Headers: `Content-Type: application/json`, `x-zevauth-bridge: 1`, sent
  with credentials (cookies).
- Posts are serialised and in order. A first page load with no session
  posts nothing.
- `client.syncSessionBridge()` posts the current state now and resolves
  when the server has answered (the handshake page uses it).

### 5.3 The bridge endpoint

Mounted by the developer at that URL, `POST` only (else 405).

1. Require `x-zevauth-bridge: 1`, else 403 `bridge_header_missing`.
2. If an `Origin` header is present, it must be in the allowed origins
   (default: the request's own origin), else 403 `bridge_origin_not_allowed`.
   Together these stop login CSRF: a page elsewhere posting its own valid
   token to sign the visitor in as someone else.
3. `token` null or empty: clear both cookies, 204.
4. Verify the token (§1.3). Refused: clear both cookies, 401
   `unauthorized` with `reason` set to the §1.4 code.
5. Set the cookies, 204.

### 5.4 Cookies

| | Session cookie | Client cookie |
| --- | --- | --- |
| Holds | The access token | `1` (no credential) |
| Max-Age | Seconds until the token's `exp` | 30 days |
| Attributes | `Path=/; HttpOnly; SameSite=Lax; Secure` | same |

Names depend on configuration:

| Configuration | Session | Client |
| --- | --- | --- |
| Default (`Secure`, no `Domain`) | `__Host-zevauth_session` | `__Host-zevauth_client` |
| `cookieDomain` set (subdomains) | `__Secure-zevauth_session` + `Domain=` | `__Secure-zevauth_client` |
| `secure: false` (plain-http local dev only) | `zevauth_session` | `zevauth_client` |

The client cookie exists because the session cookie deletes itself when
the token expires. Without a second signal, "the session expired" and
"nobody ever signed in" look the same, and the handshake could never be
offered.

### 5.5 Reading a request and the handshake

`getAuth` reads the header first, then the session cookie.
`needsHandshake` is true when no header was sent and either the cookie's
token expired or the session cookie is gone while the client cookie
remains.

`authenticateRequest(request)` returns `{ auth, handshake }`:

- No handshake needed: `handshake` is null.
- The URL carries `__zevauth_handshake=1` (we are back from one): no
  second handshake; the page renders signed out. **This is the loop guard.**
- A navigation (`GET`/`HEAD` accepting `text/html`): 302 to
  `{handshakePath}?redirect_url=<path+query>`, `Cache-Control: no-store`.
  `handshakePath` defaults to `/zevauth/handshake`.
- Anything else: 401 `session_refresh_required`. API calls should send the
  SDK's token in `Authorization` rather than rely on the cookie.

The **handshake page** (served at `handshakePath`, GET) is plain HTML
with one script tag (`@zevauth/ui`, major version pinned). It initialises
the SDK with the bridge, waits for it to load (which refreshes the
session if the browser has one), calls `syncSessionBridge()`, and
`location.replace`s to `redirect_url` with `__zevauth_handshake=1`
added. `redirect_url` must be a same-site path: it must start with `/`
and not `//` or `/\`, or the page returns to `/` (open-redirect guard).
If the browser has no session, the sync clears the cookies and the
return renders signed out.

### 5.6 Deployment notes

- **Same site.** The bridge endpoint must be same-site with the pages so
  the browser sends and accepts the cookies. Cross-subdomain setups use
  `cookieDomain` and list every page origin in `allowedOrigins`.
- **Logout.** Signing out in the SDK posts a clear. A server-side logout
  should clear both cookies too, but the SDK's session is ended only by
  the SDK (`signOut()`).
- **Multiple tabs.** Each tab posts the token it adopts. Posts are
  idempotent and the newest wins.
- **Revocation.** A cookie holds a stateless token. A revoked session stays
  accepted by servers until the token expires (minutes). Routes that must
  react at once call the API.
- **Content Security Policy.** The handshake page runs one inline script
  and loads `@zevauth/ui` from jsDelivr. Serve your own copy with
  `uiScriptUrl` and allow it (or use a nonce) under a strict CSP.

---

## 6. Versioning and compatibility

- SemVer. Within a major version: additive only. New fields, options and
  codes may appear; existing ones keep their meaning and defaults.
- Unknown claims and unknown response fields are ignored, never errors.
- An SDK states the oldest API behaviour it supports; new server features
  are used only when present (an absent claim or field means the old
  behaviour).
- A fixture added here is a new requirement for every SDK's next minor
  release. A changed fixture is a breaking change and needs a major.

---

## 7. Per-language checklist

An SDK is ready to publish when:

- [ ] Passes every file in `fixtures/` with the clock fixed to `now`.
- [ ] Verification: RS256 only, issuer from discovery, audience enforced,
      5 s skew, JWKS cache ≤ 10 min, unknown-kid refetch with a 30 s cooldown,
      local key set supported.
- [ ] `getAuth` never raises for a bad token; `requireAuth` produces the
      three refusals with the shared envelope.
- [ ] API client: secret-key checks, timeouts, the retry rule (never
      500), `Retry-After`, `requestId`, user agent, pagination iterator.
- [ ] Webhooks: raw body, constant-time compare, the three codes.
- [ ] Session bridge: endpoint, cookies, `authenticateRequest`, handshake
      page with both guards (loop, open redirect).
- [ ] Framework integrations for the language's main frameworks
      (middleware or guard, refusal → response).
- [ ] Docs page in the shared shape: install, verify a request, API
      client, webhooks, session bridge, framework guides.
- [ ] User agent `zevauth-<lang>/<version>` matches the published version.

---

## Fixtures

Regenerate with `npx tsx spec/scripts/generate-fixtures.ts`. Output is
deterministic: keys live in `fixtures/keys/` (test-only, never valid
anywhere else) and every timestamp derives from `now = 1790000000`.

| File | Contents |
| --- | --- |
| `jwks.json`, `jwks-rotated.json` | Key set before and after a rotation |
| `discovery.json` | The discovery document |
| `tokens.json` | 17 cases: valid, organization, pending task, MFA, skew, expired, not-yet-valid, `none`, HS256 confusion, RS384, wrong issuer, wrong audience, unknown kid, rotated key, tampered, malformed, plus expected `getAuth`, `has` and `requireAuth` results |
| `bearer.json` | `Authorization` header parsing |
| `webhooks.json` | 12 signature cases |
| `api-errors.json` | 9 error responses with expected code, status, retry, `requestId` |
| `bridge.json` | 6 bridge-endpoint requests with expected status and cookie effect |

The Node SDK runs them in `packages/backend/scripts/conformance.ts`;
every other SDK carries the same runner in its own test suite.
