/** @jsxImportSource react */
/*
 * Runs with React Native and the Expo modules replaced by the recording
 * stand-ins in ./mocks (see register-mocks.mjs). That proves the logic:
 * storage, links, the ZevID flow, refresh on resume, the screens, theming
 * and wording. It cannot prove behaviour on a device: the system browser
 * sheet, universal links and the keychain itself need a real phone.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
void React;
import type { ReactNode } from 'react';
import { mock } from 'react-native';
import * as secureStore from 'expo-secure-store';
import { browser as webBrowser } from 'expo-web-browser';
import {
  SignIn,
  SignUp,
  UserButton,
  UserProfile,
  ZevAuthProvider,
  useUser,
  type NativeAppearance,
  type ZevAuthProviderProps,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const USER = {
  id: 'user_1', email: 'ada@example.com', emailVerified: true, username: null, phone: null, phoneVerified: false,
  firstName: 'Ada', lastName: 'Lovelace', imageUrl: null, publicMetadata: {}, status: 'active', lastSignInAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const BRANDING = {
  appName: 'Northwind', logoUrl: null, showAppName: true, showIdentity: true, accentColor: '#2563eb',
  accentOnLight: '#2563eb', accentOnDark: '#7ba4f5', colorScheme: 'system', borderRadius: 'medium',
  fontFamily: 'system', showPoweredBy: true,
};

interface Call { method: string; path: string; body: any }

function fakeApi(options: { methods?: string[]; refresh?: (n: number) => 'ok' | 'revoked'; pendingTasks?: string[] } = {}) {
  const calls: Call[] = [];
  let issued = 0;
  let refreshes = 0;
  const session = () => {
    issued++;
    return {
      user: USER,
      session: {
        accessToken: `at_${issued}`, refreshToken: `rt_${issued}`, expiresIn: 900, organization: null,
        ...(options.pendingTasks ? { pendingTasks: options.pendingTasks } : {}),
      },
    };
  };
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace('https://api.test', '').split('?')[0];
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body });
    const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status });
    switch (path) {
      case '/v1/environment':
        return json(200, {
          id: 'env_test_x', kind: 'test', isTestMode: true,
          signInMethods: options.methods ?? ['email_password', 'magic_link', 'email_otp', 'zevid'],
          branding: BRANDING, mfa: { policy: 'optional', factors: ['totp'], rememberDeviceDays: 0 },
        });
      case '/v1/auth/refresh':
        refreshes++;
        return options.refresh?.(refreshes) === 'revoked'
          ? json(401, { error: { code: 'session_revoked', message: 'That session has ended.' } })
          : json(200, session());
      case '/v1/auth/signin':
      case '/v1/auth/magic-link/verify':
        return json(200, session());
      case '/v1/auth/handoff/exchange':
        return body?.codeVerifier || !body?.code?.startsWith('hoc_pkce')
          ? json(200, session())
          : json(400, { error: { code: 'pkce_required', message: 'This sign-in needs its verifier.' } });
      case '/v1/auth/magic-link':
      case '/v1/auth/email-code':
        return json(200, { sent: true });
      case '/v1/auth/signup':
        return json(200, { requiresEmailVerification: true, session: null });
      case '/v1/me/mfa/totp':
        return json(200, { factorId: 'fac_1', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Northwind:ada?secret=JBSWY3DPEHPK3PXP' });
      case '/v1/auth/signout':
        return json(200, {});
      default:
        return json(404, { error: { code: 'not_found', message: path } });
    }
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const REDIRECT = 'https://acme.example/auth/callback';

async function mount(
  api: ReturnType<typeof fakeApi>,
  children: ReactNode,
  extra: Partial<ZevAuthProviderProps> = {},
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  const { createZevAuth } = await import('@zevauth/js');
  const { secureStoreStorage, expoCrypto } = await import('../src/index');
  /*
   * The client is built the way the provider builds it, with the fake
   * API's fetch, then handed in. Everything else is the provider's own.
   */
  const client = createZevAuth({
    publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: api.fetch,
    asyncStorage: secureStoreStorage, crypto: expoCrypto,
  });
  await act(async () => {
    renderer = create(
      <ZevAuthProvider client={client} redirectUrl={REDIRECT} {...extra}>
        {children}
      </ZevAuthProvider>,
    );
  });
  await settle();
  return renderer;
}

const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const byTestId = (r: ReactTestRenderer, id: string) => r.root.find((n) => n.props.testID === id && typeof n.type === 'string');
const flatStyle = (style: unknown): Record<string, unknown> => {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return typeof style === 'object' ? (style as Record<string, unknown>) : {};
};

function reset() {
  secureStore.store.clear();
  secureStore.calls.length = 0;
  webBrowser.calls.length = 0;
  webBrowser.dismissed = 0;
  webBrowser.next = { type: 'cancel' };
  mock.initialUrl = null;
  mock.urlListeners.clear();
  mock.appStateListeners.clear();
  mock.opened.length = 0;
  mock.colorScheme = 'light';
}

function Who() {
  const { isLoaded, user } = useUser();
  return <>{isLoaded ? user?.email ?? 'signed-out' : 'loading'}</>;
}

async function main() {
  console.log('\n\x1b[1mThe session in the keychain\x1b[0m');
  {
    reset();
    secureStore.store.set('zevauth.session.test', JSON.stringify({ refreshToken: 'rt_saved', expiresAt: 0, user: USER, organization: null }));
    const api = fakeApi();
    const r = await mount(api, <Who />);
    check('a saved session is read from secure storage before restoring', text(r).includes('ada@example.com'));
    check('using the device-only keychain class', secureStore.calls.some(([op, , o]) => op === 'get' && o?.keychainAccessible === secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY));
    check('and the rotated refresh token is written back', JSON.parse(secureStore.store.get('zevauth.session.test') ?? '{}').refreshToken === 'rt_1');
    check('the shared hooks from @zevauth/react work unchanged', text(r).includes('ada@example.com'));
  }

  console.log('\n\x1b[1mLinks the app is opened with\x1b[0m');
  {
    reset();
    mock.initialUrl = `${REDIRECT}?zv_token=good-link&zv_flow=sign-in`;
    const api = fakeApi();
    const r = await mount(api, <Who />);
    check('a sign-in link that launched the app signs in', text(r).includes('ada@example.com') && api.calls.some((c) => c.path === '/v1/auth/magic-link/verify'));
  }
  {
    reset();
    const api = fakeApi();
    const r = await mount(api, <Who />);
    await act(async () => {
      for (const l of mock.urlListeners) l({ url: `${REDIRECT}?zv_token=good-link&zv_flow=sign-in` });
    });
    await settle();
    check('and so does one arriving while the app is open', text(r).includes('ada@example.com'));
  }

  console.log('\n\x1b[1mContinue with ZevID\x1b[0m');
  {
    reset();
    const api = fakeApi();
    webBrowser.next = (url: string) => {
      const state = decodeURIComponent(/state=([^&]+)/.exec(url)?.[1] ?? '');
      return { type: 'success', url: `${REDIRECT}?code=hoc_pkce_1&state=${encodeURIComponent(state)}` };
    };
    const r = await mount(api, <SignIn />);
    await act(async () => byTestId(r, 'zevauth-zevid').props.onPress());
    await settle();
    const call = webBrowser.calls[0];
    check('it opens the system authentication session with our redirect', call?.redirectUrl === REDIRECT && call.url.startsWith('https://api.test/v1/auth/zevid/start?'));
    check('never ephemeral, as ZevID asked', call?.options === undefined || call.options.preferEphemeralSession !== true);
    check('with an S256 PKCE challenge and a state', /code_challenge_method=S256/.test(call?.url ?? '') && /state=/.test(call?.url ?? ''));
    const exchange = api.calls.find((c) => c.path === '/v1/auth/handoff/exchange');
    check('the return is exchanged with the verifier and the exact redirect', typeof exchange?.body?.codeVerifier === 'string' && exchange?.body?.redirectUri === REDIRECT);
    check('and the person is signed in', !text(r).includes('zevauth-sign-in'));

    // Android can deliver the same return as a link event as well.
    await act(async () => {
      for (const l of mock.urlListeners) l({ url: `${REDIRECT}?code=hoc_pkce_1&state=x` });
    });
    await settle();
    check('the same return arriving twice is handled once', api.calls.filter((c) => c.path === '/v1/auth/handoff/exchange').length === 1);
  }
  {
    reset();
    const api = fakeApi();
    webBrowser.next = { type: 'success', url: `${REDIRECT}?code=hoc_pkce_2&state=forged` };
    const r = await mount(api, <SignIn />);
    await act(async () => byTestId(r, 'zevauth-zevid').props.onPress());
    await settle();
    check('a return with someone else’s state is refused and explained', text(r).includes('not started from this app') && !api.calls.some((c) => c.path === '/v1/auth/handoff/exchange'));
  }
  {
    reset();
    const api = fakeApi();
    webBrowser.next = { type: 'cancel' };
    const r = await mount(api, <SignIn />);
    await act(async () => byTestId(r, 'zevauth-zevid').props.onPress());
    await settle();
    check('closing the sheet leaves the form as it was', text(r).includes('zevauth-sign-in') && !text(r).includes('alert'));
  }

  console.log('\n\x1b[1mComing back to the foreground\x1b[0m');
  {
    reset();
    secureStore.store.set('zevauth.session.test', JSON.stringify({ refreshToken: 'rt_saved', expiresAt: 0, user: USER, organization: null }));
    // Restores fine, then the session is ended elsewhere.
    const api = fakeApi({ refresh: (n) => (n === 1 ? 'ok' : 'revoked') });
    const r = await mount(api, <Who />);
    const realNow = Date.now;
    try {
      await act(async () => {
        for (const l of mock.appStateListeners) l('background');
      });
      check('going to the background does nothing', api.calls.filter((c) => c.path === '/v1/auth/refresh').length === 1);
      // Two hours later, the app is opened again.
      Date.now = () => realNow() + 2 * 60 * 60 * 1000;
      await act(async () => {
        for (const l of mock.appStateListeners) l('active');
      });
      await settle();
    } finally {
      Date.now = realNow;
    }
    check('coming back refreshes the stale session', api.calls.filter((c) => c.path === '/v1/auth/refresh').length === 2);
    check('and a session ended elsewhere signs out here', text(r).includes('signed-out') && !secureStore.store.has('zevauth.session.test'));
  }

  console.log('\n\x1b[1mThe screens\x1b[0m');
  {
    reset();
    const api = fakeApi();
    const r = await mount(api, <SignIn />);
    check('sign-in renders every enabled method', ['zevauth-zevid', 'zevauth-password', 'zevauth-magic-link', 'zevauth-email-code-start'].every((id) => text(r).includes(id)));
    await act(async () => {
      byTestId(r, 'zevauth-identifier').props.onChangeText('ada@example.com');
      byTestId(r, 'zevauth-password').props.onChangeText('correct horse');
    });
    await act(async () => byTestId(r, 'zevauth-submit').props.onPress());
    await settle();
    const signin = api.calls.find((c) => c.path === '/v1/auth/signin');
    check('and submits a password sign-in', signin?.body?.email === 'ada@example.com' && signin?.body?.password === 'correct horse');
  }
  {
    reset();
    const api = fakeApi();
    const r = await mount(api, <SignIn />);
    await act(async () => byTestId(r, 'zevauth-identifier').props.onChangeText('ada@example.com'));
    await act(async () => byTestId(r, 'zevauth-magic-link').props.onPress());
    await settle();
    const sent = api.calls.find((c) => c.path === '/v1/auth/magic-link');
    check('a sign-in link is sent back to the app’s own redirect', sent?.body?.redirectUrl === REDIRECT && text(r).includes('zevauth-link-sent'));
  }
  {
    reset();
    const api = fakeApi({ methods: ['email_password'] });
    const r = await mount(api, <SignUp />);
    await act(async () => {
      byTestId(r, 'zevauth-signup-email').props.onChangeText('new@example.com');
      byTestId(r, 'zevauth-signup-password').props.onChangeText('long enough');
      byTestId(r, 'zevauth-signup-confirm').props.onChangeText('long enough');
    });
    await act(async () => byTestId(r, 'zevauth-signup-submit').props.onPress());
    await settle();
    check('sign-up creates the account and asks for the emailed code', api.calls.some((c) => c.path === '/v1/auth/signup') && text(r).includes('zevauth-verify-code'));
  }
  {
    reset();
    const api = fakeApi({ pendingTasks: ['setup_mfa'] });
    const r = await mount(api, <SignIn />);
    await act(async () => {
      byTestId(r, 'zevauth-identifier').props.onChangeText('ada@example.com');
      byTestId(r, 'zevauth-password').props.onChangeText('pw');
    });
    await act(async () => byTestId(r, 'zevauth-submit').props.onPress());
    await settle();
    check('a required two-step setup takes over after sign-in', text(r).includes('zevauth-task-setup-mfa'));
    await act(async () => byTestId(r, 'zevauth-mfa-start').props.onPress());
    await settle();
    check('setup shows the key to type, grouped', text(r).includes('JBSW Y3DP EHPK 3PXP'));
    await act(async () => byTestId(r, 'zevauth-mfa-open-app').props.onPress());
    await settle();
    check('and hands the otpauth link to the authenticator app instead of a QR code', mock.opened[0]?.startsWith('otpauth://'));
  }
  {
    reset();
    secureStore.store.set('zevauth.session.test', JSON.stringify({ refreshToken: 'rt_saved', expiresAt: 0, user: USER, organization: null }));
    const api = fakeApi();
    const r = await mount(api, <UserButton />);
    await act(async () => byTestId(r, 'zevauth-user-button').props.onPress());
    check('the user button opens a sheet with the person in it', text(r).includes('zevauth-user-menu') && text(r).includes('Ada Lovelace'));
    await act(async () => byTestId(r, 'zevauth-sign-out').props.onPress());
    await settle();
    check('and signs out from it, clearing the keychain', api.calls.some((c) => c.path === '/v1/auth/signout') && !secureStore.store.has('zevauth.session.test'));
  }
  {
    reset();
    secureStore.store.set('zevauth.session.test', JSON.stringify({ refreshToken: 'rt_saved', expiresAt: 0, user: USER, organization: null }));
    const api = fakeApi();
    const r = await mount(api, <UserProfile />);
    check('the profile renders for the signed-in person', text(r).includes('zevauth-user-profile') && !text(r).includes('zevauth-sessions'));
  }

  console.log('\n\x1b[1mTheming and wording\x1b[0m');
  {
    reset();
    const api = fakeApi({ methods: ['email_password'] });
    const r = await mount(api, <SignIn />);
    const card = flatStyle(byTestId(r, 'zevauth-sign-in').props.style);
    const primary = flatStyle(byTestId(r, 'zevauth-submit').props.style);
    check('the console accent paints the primary button', primary.backgroundColor === '#2563eb');
    check('the default card is light with a hairline border', card.backgroundColor === '#ffffff' && card.borderWidth === 1);
  }
  {
    reset();
    mock.colorScheme = 'dark';
    const api = fakeApi({ methods: ['email_password'] });
    const r = await mount(api, <SignIn />);
    const card = flatStyle(byTestId(r, 'zevauth-sign-in').props.style);
    const primary = flatStyle(byTestId(r, 'zevauth-submit').props.style);
    check('a dark phone gets the dark palette and the dark accent', card.backgroundColor === '#18181b' && primary.backgroundColor === '#7ba4f5');
  }
  {
    reset();
    const appearance: NativeAppearance = {
      theme: 'sharp',
      variables: { colorPrimary: { light: '#0f766e', dark: '#5eead4' }, borderRadius: 3 },
      elements: { buttonPrimary: { paddingVertical: 14 } },
    };
    const api = fakeApi({ methods: ['email_password'] });
    const r = await mount(api, <SignIn />, { appearance });
    const card = flatStyle(byTestId(r, 'zevauth-sign-in').props.style);
    const primary = flatStyle(byTestId(r, 'zevauth-submit').props.style);
    check('a named theme applies', card.borderWidth === 2);
    check('variables override the theme and the console', primary.backgroundColor === '#0f766e' && primary.borderRadius === 3);
    check('elements apply to the part they name', primary.paddingVertical === 14);
  }
  {
    reset();
    const api = fakeApi({ methods: ['email_password', 'magic_link'] });
    const r = await mount(api, <SignIn />, {
      localization: { common: { email: 'E-mail', password: 'Mot de passe' }, signIn: { submit: 'Se connecter' } },
    });
    check('the web’s localization shape translates the native screens', text(r).includes('Mot de passe') && text(r).includes('Se connecter') && text(r).includes('E-mail'));
    check('and anything left out stays English', text(r).includes('Email me a sign-in link'));
  }

  console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
