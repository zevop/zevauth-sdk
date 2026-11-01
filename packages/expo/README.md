# @zevauth/expo

Authentication for Expo and React Native: the same hooks as `@zevauth/react`,
native sign-in screens, the session in the Keychain/Keystore, and Sign in with
ZevID through the system browser.

```bash
npx expo install @zevauth/expo expo-secure-store expo-web-browser expo-crypto
```

```tsx
import { ZevAuthProvider, SignIn, SignedIn, SignedOut, UserButton } from '@zevauth/expo';

export default function App() {
  return (
    <ZevAuthProvider
      publishableKey={process.env.EXPO_PUBLIC_ZEVAUTH_KEY!}
      redirectUrl="https://acme.example/auth/callback"
    >
      <SignedOut><SignIn /></SignedOut>
      <SignedIn><UserButton /></SignedIn>
    </ZevAuthProvider>
  );
}
```

`redirectUrl` is where sign-in links and ZevID return to your app: a universal
link / app link on your verified domain in production, or a custom scheme such
as `acme://auth/callback` in development. Register it in the ZevAuth console
under Domains & callbacks, and register the app under Mobile apps.

## What it does for you

- The refresh token lives in the Keychain (iOS) or Keystore (Android), device
  only. The access token stays in memory.
- Links the app is opened with (sign-in links, email confirmation, ZevID
  returns) are finished automatically.
- Sign in with ZevID opens the system authentication session, never an embedded
  web view, with PKCE and a checked `state`.
- When the app returns to the foreground the session is re-checked, so a session
  ended elsewhere signs out here too.

## Hooks and components

`useUser`, `useAuth`, `useOrganization`, `useOrganizationList`, `useZevAuth`,
`<SignedIn>`, `<SignedOut>`, `<ZevAuthLoading>` and `<Protect>` are the web
package's own, so they behave identically.

Screens: `<SignIn>`, `<SignUp>`, `<UserButton>`, `<UserAvatar>`, `<UserProfile>`,
`<TaskSetupMfa>`.

## Customising

`appearance` takes the same `theme` names and the same `variables` as the web, in
native units, and `elements` as React Native style objects keyed by the web's
element names. `localization` takes the web's shape, plus a `native` group.

## Bare React Native

Install the three Expo modules with `npx install-expo-modules`, or pass your own
`storage`, `crypto` and `browser` adapters to the provider.

## Documentation

<https://docs.zevauth.com/sdk/expo>

## License

MIT
