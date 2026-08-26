# @zevauth/nextjs

Authentication for Next.js: the React components, plus server helpers and route
protection.

```bash
npm install @zevauth/nextjs
```

Two entry points, and the split matters. Everything that renders is a client
component; everything that verifies is server-only.

```ts
import { SignIn, useUser } from '@zevauth/nextjs';       // client
import { getAuth } from '@zevauth/nextjs/server';         // server
```

## Reading auth on the server

```ts
import { getAuth } from '@zevauth/nextjs/server';

export async function GET(request: Request) {
  const auth = await getAuth(request, {
    environmentId: process.env.ZEVAUTH_ENVIRONMENT_ID!,
  });

  if (!auth.isSignedIn) return new Response('Unauthorized', { status: 401 });
  return Response.json({ userId: auth.userId });
}
```

This verifies **offline**, against your environment's published keys. Your
backend never calls ZevAuth to check a token, so an outage of ours is not an
outage of yours.

## Middleware

```ts
// middleware.ts
import { createZevAuthMiddleware } from '@zevauth/nextjs/server';

export default createZevAuthMiddleware({
  environmentId: process.env.ZEVAUTH_ENVIRONMENT_ID!,
  protected: ['/dashboard', '/settings'],
});

export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
```

Protection is opt-in, path by path. Protect-by-default sounds safer and is not:
it protects the sign-in page too, and the callback it redirects to, so the app
redirect-loops.

## Documentation

<https://docs.zevauth.com/sdk/nextjs>

## License

MIT
