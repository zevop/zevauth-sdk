# @zevauth/react

Authentication for React: hooks, control components, and drop-in UI that
renders in your brand.

```bash
npm install @zevauth/react
```

```tsx
import { ZevAuthProvider, SignIn, SignedIn, SignedOut, UserButton } from '@zevauth/react';

export function App() {
  return (
    <ZevAuthProvider publishableKey={import.meta.env.VITE_ZEVAUTH_KEY}>
      <SignedOut><SignIn /></SignedOut>
      <SignedIn><UserButton /></SignedIn>
    </ZevAuthProvider>
  );
}
```

That is a complete sign-in. `<SignIn />` renders whichever methods your
environment has enabled, so turning magic links on in the console makes them
appear without a deploy.

## Hooks

```tsx
const { isLoaded, isSignedIn, user } = useUser();
const { userId, organizationId, getToken, signOut } = useAuth();
const { organizations, setActive } = useOrganizationList();
```

`isLoaded` is separate from `isSignedIn` because there are three states, not
two. On the first render of a page there is no answer yet, and collapsing that
into "signed out" makes every reload flash your signed-out UI.

## Components

`<SignIn>` `<SignUp>` `<UserButton>` `<UserProfile>` `<OrganizationSwitcher>`
`<OrganizationProfile>`

They bring their own styles, injected once. There is no stylesheet to import.
Every class is prefixed `zv-` and nothing styles bare elements, so the styles
cannot reach your markup and yours cannot reach ours.

## Protecting UI

```tsx
<Protect permission="org:members:manage" fallback={<p>Ask an admin.</p>}>
  <InviteForm />
</Protect>
```

`<Protect>` hides UI. It does not protect data: everything it hides is still in
your bundle. The same check has to exist on your server, against the verified
token.

## Documentation

<https://docs.zevauth.com/sdk/react>

## License

MIT
