# @zevauth/backend

ZevAuth from your server. Manage users and organizations with a secret key.

```bash
npm install @zevauth/backend
```

```ts
import { createZevAuthBackend } from '@zevauth/backend';

const zevauth = createZevAuthBackend({
  secretKey: process.env.ZEVAUTH_SECRET_KEY!,
});

const user = await zevauth.users.create({
  email: 'ada@example.com',
  publicMetadata: { plan: 'pro' },
});
```

## This is not the browser package

`@zevauth/js` carries a publishable key and is meant to ship inside your
bundle. This carries a **secret key**, which can read every user's address,
set anybody's password, and delete an entire organization.

Never import this package into client code, and never hardcode the key. It
refuses a `pk_…` key at construction, because the reverse mistake — reaching
for this in a browser and pasting a secret key to make it work — is the one
that cannot be undone.

## What it does

- `users` — list, get, create, update, block, revoke sessions, delete
- `organizations` — list, get, create, update, delete, add and remove members

Full reference at [docs.zevauth.com](https://docs.zevauth.com/sdk/backend/).

## Retries

Requests that could not be answered are retried: a dropped connection, a
timeout, a 429, or a 502/503/504. A bare 500 is **not** retried, because our
code ran and may have written something before it failed — repeating it is how
one `create` becomes two records. Nothing 4xx is retried either; it would fail
identically forever.
