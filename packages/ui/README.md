# @zevauth/ui

ZevAuth's sign-in, sign-up, profile and organization components for any page:
Vue, Svelte, Angular, Astro, Rails or Django views, or plain HTML.

```bash
npm install @zevauth/ui
```

```ts
import { createZevAuthUI } from '@zevauth/ui';

const zevauth = createZevAuthUI({ publishableKey: 'pk_live_...' });

const signIn = zevauth.mountSignIn('#sign-in', { afterSignInUrl: '/dashboard' });
zevauth.mountUserButton('#account');

// Later
signIn.update({ afterSignInUrl: '/welcome' });
signIn.unmount();
```

Or from a script tag, with no build step:

```html
<div id="sign-in"></div>
<script src="https://cdn.jsdelivr.net/npm/@zevauth/ui@0.1.0/dist/zevauth-ui.global.js"></script>
<script>
  ZevAuthUI.init({ publishableKey: 'pk_live_...' });
  ZevAuthUI.mountSignIn('#sign-in');
</script>
```

Every component from one `createZevAuthUI` (or `init`) shares one client and
one session. `appearance` and `localization` work exactly as in
`@zevauth/react`.

The components are built with React, and this package carries its own copy, so
your page does not need React. If your app is already React, use
`@zevauth/react` instead and share the React you have.

## Documentation

<https://docs.zevauth.com/sdk/ui>

## License

MIT
