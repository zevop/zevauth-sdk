# ZevAuth SDKs

The official JavaScript and TypeScript SDKs for [ZevAuth](https://zevauth.com):
authentication, user management and organizations for your app, with drop-in
UI that takes on your brand.

## Packages

| Package | For |
| --- | --- |
| [`@zevauth/react`](packages/react) | React apps: hooks, control components and ready-made screens |
| [`@zevauth/nextjs`](packages/nextjs) | Next.js: everything in `@zevauth/react`, plus server helpers and middleware |
| [`@zevauth/vue`](packages/vue) | Vue 3 and Nuxt: composables, control components and screens |
| [`@zevauth/expo`](packages/expo) | Expo and React Native: native screens, secure storage, deep links |
| [`@zevauth/ui`](packages/ui) | Any page, with no framework: mount the screens, or load one script tag |
| [`@zevauth/js`](packages/js) | The browser client the others are built on, for your own UI |
| [`@zevauth/backend`](packages/backend) | Node.js servers: verify sessions, call the backend API, check webhooks |

```bash
npm install @zevauth/react
```

```tsx
import { ZevAuthProvider, SignIn, SignedIn, SignedOut, UserButton } from '@zevauth/react';

export function App() {
  return (
    <ZevAuthProvider publishableKey="pk_live_...">
      <SignedOut><SignIn /></SignedOut>
      <SignedIn><UserButton /></SignedIn>
    </ZevAuthProvider>
  );
}
```

That's a complete sign-in. The screens show the methods you enable in the
ZevAuth console, and take your logo, colours and wording from there or from
code. See [Customising the components](https://docs.zevauth.com/concepts/appearance).

## Other languages

Server libraries for other languages live in their own repositories:

| Language | Repository |
| --- | --- |
| PHP, Laravel | [zevop/zevauth-php](https://github.com/zevop/zevauth-php) |
| Python: FastAPI, Django, Flask | [zevop/zevauth-python](https://github.com/zevop/zevauth-python) |
| Ruby, Rails | [zevop/zevauth-ruby](https://github.com/zevop/zevauth-ruby) |
| Go | [zevop/zevauth-go](https://github.com/zevop/zevauth-go) |
| Java, Spring Boot | [zevop/zevauth-java](https://github.com/zevop/zevauth-java) |

Every server library, including `@zevauth/backend`, implements one contract,
[`spec/SERVER_SDK.md`](spec/SERVER_SDK.md), and passes the same conformance
fixtures in [`spec/fixtures`](spec/fixtures). A token one library rejects,
they all reject.

## Documentation

<https://docs.zevauth.com>

## Repository layout

```
packages/   one folder per npm package
spec/       the server SDK contract and its conformance fixtures
scripts/    release tooling
```

```bash
npm install
npm run build       # every package
npm run typecheck
npm run verify      # every package's test suite
```

## Support

Bug reports and feature requests: [open an issue](https://github.com/zevop/zevauth-sdk/issues).
For help with your account or environment, contact ZevAuth support.

Please report security issues privately to ZevAuth support rather than in a
public issue.

## License

[MIT](LICENSE). Copyright (c) 2026 ZevOp Inc.
