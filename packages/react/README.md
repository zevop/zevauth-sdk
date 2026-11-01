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

## Customising

Every component takes `appearance`, and so does the provider, for all of them.
It has three layers, from broadest to narrowest:

```tsx
<ZevAuthProvider
  publishableKey="pk_live_..."
  appearance={{
    // The console's own fields, overridden from code.
    cardStyle: 'flat',
    // Design tokens. Colours take one value or a { light, dark } pair.
    variables: {
      colorPrimary: { light: '#4f46e5', dark: '#a5b4fc' },
      fontFamily: 'inherit',
      fontSize: '14px',
      borderRadius: '10px',
    },
    // One part at a time: a class name or a style object.
    elements: {
      card: 'shadow-xl',
      buttonPrimary: 'font-semibold hover:bg-indigo-500',
      input: { borderWidth: 2 },
    },
    // Puts our CSS in a cascade layer so your utility classes win.
    cssLayerName: 'zevauth',
  }}
>
```

A component's `appearance` merges over the provider's, and anything you leave
out keeps its console value. `Appearance` is exported to type a shared theme.
Every `zv-` class and `data-` attribute is public, so styling from your own
stylesheet works too.

For server rendering, put the stylesheet in the HTML with
`getComponentStyles()` from `@zevauth/react/styles`. That entry contains no
React, so a server component can import it.

Every variable and element, with recipes:
<https://docs.zevauth.com/concepts/appearance>

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
