# @zevauth/js

ZevAuth for the browser, without a framework. This is what
[`@zevauth/react`](https://www.npmjs.com/package/@zevauth/react) is built on;
use it directly for Vue, Svelte, vanilla JavaScript, or anywhere you want the
flows without the components.

```bash
npm install @zevauth/js
```

```ts
import { createZevAuth } from '@zevauth/js';

const zevauth = createZevAuth({ publishableKey: 'pk_test_...' });
await zevauth.load();

await zevauth.signIn.withPassword({ identifier: 'ada@example.com', password });

zevauth.user;              // the signed-in user, or null
await zevauth.getToken();  // a valid access token for your own API
```

`load()` reads your environment, restores any stored session, and completes a
hosted-page handoff if the URL carries one. Call it once at start-up.

## What it handles for you

**Refresh, exactly once.** ZevAuth rotates refresh tokens and treats a replayed
one as theft, ending the session on every device. Two browser tabs refreshing
at the same moment would do that to themselves, so refreshes are serialised
across tabs with a browser lock.

**Token storage.** The access token is held in memory only. The refresh token
is persisted so a session survives a reload, and that is worth being plain
about: storage is readable by any script on your page. Rotation with reuse
detection is what makes that survivable rather than safe. It is not a
substitute for not having XSS.

**Hosted handoffs.** A magic link lands on a ZevAuth page, which redirects back
to your app with a one-time code. `load()` exchanges it and strips it from the
URL.

## Documentation

<https://docs.zevauth.com/sdk/javascript>

## License

MIT
