/** @jsxImportSource react */
import './_react-global';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { createZevAuth, type ZevAuth } from '@zevauth/js';
import { ZevAuthProvider } from '../src/provider';
import {
  Protect,
  SignedIn,
  SignedOut,
  ZevAuthLoading,
} from '../src/components/control';
import { useAuth } from '../src/hooks/useAuth';
import { useUser } from '../src/hooks/useUser';
import { SignIn } from '../src/components/SignIn';
import { UserButton } from '../src/components/UserButton';
import { readableOn } from '../src/components/Brandable';
import { OrganizationProfile } from '../src/components/OrganizationProfile';
import { SignUp } from '../src/components/SignUp';

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
  id: 'user_1',
  email: 'a@example.com',
  emailVerified: true,
  username: null,
  phone: null,
  phoneVerified: false,
  firstName: 'A',
  lastName: null,
  imageUrl: null,
  publicMetadata: {},
  status: 'active',
  lastSignInAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** A client already in a known state, so rendering is synchronous. */
const BRANDING = {
  appName: 'Northwind',
  logoUrl: null,
  showAppName: true,
  accentColor: '#2563eb',
  accentOnLight: '#2563eb',
  accentOnDark: '#7ba4f5',
  colorScheme: 'light' as const,
  borderRadius: 'medium' as const,
  fontFamily: 'system' as const,
  showPoweredBy: true,
};

function clientIn(state: {
  loaded: boolean;
  user?: typeof USER | null;
  organization?: { id: string; name: string; slug: string | null; role: string; permissions?: string[] } | null;
  methods?: string[];
  branding?: Partial<typeof BRANDING> | null;
  isTestMode?: boolean;
}): ZevAuth {
  const client = createZevAuth({
    publishableKey: 'pk_test_x',
    apiUrl: 'https://api.test',
    fetch: (() => new Promise(() => {})) as unknown as typeof fetch,
    storage: {
      get: () => null,
      set: () => {},
      remove: () => {},
    },
  });

  // The provider reads these through the client's own accessors, so the
  // shape under test is the real one.
  Object.defineProperty(client, 'isLoaded', { get: () => state.loaded });
  Object.defineProperty(client, 'user', { get: () => state.user ?? null });
  Object.defineProperty(client, 'organization', {
    get: () => state.organization ?? null,
  });
  Object.defineProperty(client, 'signInMethods', {
    get: () => state.methods ?? [],
  });
  Object.defineProperty(client, 'branding', {
    get: () =>
      state.branding === null ? null : { ...BRANDING, ...state.branding },
  });
  Object.defineProperty(client, 'isTestMode', {
    get: () => state.isTestMode ?? false,
  });
  Object.defineProperty(client, 'environmentId', {
    get: () => 'env_test_x',
  });
  client.load = async () => {};

  return client;
}

function render(client: ZevAuth, children: ReactNode): string {
  /*
   * `<!-- -->` separators are stripped. React inserts one between
   * adjacent text expressions so it can find the boundaries again when
   * hydrating; they are invisible to a reader and would make every
   * assertion here about React's internals rather than about the
   * component.
   */
  return renderToString(
    <ZevAuthProvider client={client}>{children}</ZevAuthProvider>,
  ).replaceAll('<!-- -->', '');
}

function Whoami() {
  const { user, isLoaded, isSignedIn } = useUser();
  return (
    <span>
      {String(isLoaded)}|{String(isSignedIn)}|{user?.id ?? 'none'}
    </span>
  );
}

function TokenShape() {
  const { userId, organizationId, isSignedIn } = useAuth();
  return (
    <span>
      {userId ?? 'no-user'}|{organizationId ?? 'no-org'}|{String(isSignedIn)}
    </span>
  );
}

console.log('\n\x1b[1mThe three states, not two\x1b[0m');

{
  const loading = render(
    clientIn({ loaded: false }),
    <>
      <ZevAuthLoading>loading</ZevAuthLoading>
      <SignedIn>in</SignedIn>
      <SignedOut>out</SignedOut>
      <Whoami />
    </>,
  );
  check('while loading, <ZevAuthLoading> renders', loading.includes('loading'));
  check(
    'and neither <SignedIn> nor <SignedOut> does',
    !loading.includes('>in<') && !loading.includes('>out<'),
    loading,
  );
  check(
    'so a reload cannot flash the signed-out UI',
    loading.includes('false|false|none'),
  );
}

{
  const out = render(
    clientIn({ loaded: true, user: null }),
    <>
      <ZevAuthLoading>loading</ZevAuthLoading>
      <SignedOut>out</SignedOut>
      <SignedIn>in</SignedIn>
    </>,
  );
  check('loaded and signed out shows only <SignedOut>', out.includes('out') && !out.includes('in<'));
}

{
  const inHtml = render(
    clientIn({ loaded: true, user: USER }),
    <>
      <SignedIn>in</SignedIn>
      <SignedOut>out</SignedOut>
      <Whoami />
    </>,
  );
  check('loaded and signed in shows only <SignedIn>', inHtml.includes('in') && !inHtml.includes('out<'));
  check('and useUser reports the user', inHtml.includes('true|true|user_1'));
}

console.log('\n\x1b[1mMissing provider says what to do\x1b[0m');

{
  let message = '';
  try {
    renderToString(<Whoami />);
  } catch (err) {
    message = (err as Error).message;
  }
  check('it throws rather than reading null', message.length > 0);
  check(
    'and names the component to add',
    /ZevAuthProvider/.test(message) && /publishableKey/.test(message),
    message,
  );
}

console.log('\n\x1b[1m<Protect>\x1b[0m');

{
  const admin = {
    id: 'org_1',
    name: 'Acme',
    slug: 'acme',
    role: 'admin',
    permissions: ['billing:manage'],
  };

  const asAdmin = render(
    clientIn({ loaded: true, user: USER, organization: admin }),
    <Protect role="admin" fallback={<span>denied</span>}>
      <span>allowed</span>
    </Protect>,
  );
  check('the right role is allowed', asAdmin.includes('allowed'));

  const asMember = render(
    clientIn({
      loaded: true,
      user: USER,
      organization: { ...admin, role: 'member', permissions: [] },
    }),
    <Protect role="admin" fallback={<span>denied</span>}>
      <span>allowed</span>
    </Protect>,
  );
  check('the wrong role gets the fallback', asMember.includes('denied'));

  const byPermission = render(
    clientIn({ loaded: true, user: USER, organization: admin }),
    <Protect permission="billing:manage" fallback={<span>denied</span>}>
      <span>allowed</span>
    </Protect>,
  );
  check('a held permission is allowed', byPermission.includes('allowed'));

  const missingPermission = render(
    clientIn({
      loaded: true,
      user: USER,
      organization: { ...admin, permissions: ['members:read'] },
    }),
    <Protect permission="billing:manage" fallback={<span>denied</span>}>
      <span>allowed</span>
    </Protect>,
  );
  check('a missing one is not', missingPermission.includes('denied'));

  const personal = render(
    clientIn({ loaded: true, user: USER, organization: null }),
    <Protect role="admin" fallback={<span>denied</span>}>
      <span>allowed</span>
    </Protect>,
  );
  check(
    'a personal session cannot satisfy an organization role',
    personal.includes('denied'),
  );

  const whileLoading = render(
    clientIn({ loaded: false }),
    <Protect role="admin" fallback={<span>denied</span>}>
      <span>allowed</span>
    </Protect>,
  );
  check(
    'and nothing is decided before the session is known',
    !whileLoading.includes('allowed') && !whileLoading.includes('denied'),
    whileLoading,
  );
}

console.log('\n\x1b[1museAuth carries ids, not a profile\x1b[0m');

{
  const html = render(
    clientIn({
      loaded: true,
      user: USER,
      organization: { id: 'org_1', name: 'Acme', slug: null, role: 'admin' },
    }),
    <TokenShape />,
  );
  check('it reports the user and organization ids', html.includes('user_1|org_1|true'));
}

console.log('\n\x1b[1m<SignIn> renders what is ENABLED\x1b[0m');

{
  const passwordOnly = render(
    clientIn({ loaded: true, user: null, methods: ['password'] }),
    <SignIn />,
  );
  check('a password form is offered', passwordOnly.includes('type="password"'));
  check(
    'the identifier field is filed under `username`, so either works',
    passwordOnly.includes('autoComplete="username"') ||
      passwordOnly.includes('autocomplete="username"'),
  );
  check(
    'no ZevID button when SSO is off',
    !passwordOnly.includes('Continue with ZevID'),
  );
  check(
    'no code button when email codes are off',
    !passwordOnly.includes('Email me a code'),
  );
  check('and a way out of a forgotten password', passwordOnly.includes('Forgot'));

  const everything = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['password', 'magic_link', 'email_otp', 'zevid'],
    }),
    <SignIn />,
  );
  check('SSO appears when enabled', everything.includes('Continue with ZevID'));
  check('so does the link option', everything.includes('sign-in link'));
  check('and the code option', everything.includes('Email me a code'));

  const nothing = render(
    clientIn({ loaded: true, user: null, methods: [] }),
    <SignIn />,
  );
  check(
    'an environment with nothing enabled says so, rather than rendering an empty box',
    nothing.includes('No sign-in methods are enabled'),
  );
}

console.log('\n\x1b[1mBranding and attribution\x1b[0m');

{
  const branded = render(
    clientIn({ loaded: true, user: null, methods: ['password'] }),
    <SignIn />,
  );
  check('the accent is applied as a CSS variable', branded.includes('--zv-accent'));
  check('the app name is shown', branded.includes('Northwind'));
  check(
    'the attribution links to www, skipping the redirect hop',
    branded.includes('https://www.zevauth.com'),
  );
  check(
    'carrying which environment it came from',
    branded.includes('ref=env_test_x'),
  );
  check(
    'and it opens in a new tab, safely',
    branded.includes('rel="noopener noreferrer"'),
  );

  const noBadge = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['password'],
      branding: { showPoweredBy: false },
    }),
    <SignIn />,
  );
  check(
    'a plan that allows removing the badge removes it',
    !noBadge.includes('Secured by'),
  );

  const wordmark = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['password'],
      branding: { logoUrl: 'https://cdn.test/logo.svg', showAppName: false },
    }),
    <SignIn />,
  );
  check('a wordmark logo does not print the name twice', !wordmark.includes('zv-appname'));
  check(
    'but the logo carries the name for screen readers',
    wordmark.includes('alt="Northwind"'),
  );

  const testMode = render(
    clientIn({ loaded: true, user: null, methods: ['password'], isTestMode: true }),
    <SignIn />,
  );
  check('test mode is called out', testMode.includes('Test mode'));
  check('and production says nothing about it', !branded.includes('Test mode'));
}

console.log('\n\x1b[1mContrast on the accent\x1b[0m');

check('a pale accent gets dark text', readableOn('#ffe066') === '#171717');
check('a dark accent gets light text', readableOn('#1a1a1a') === '#ffffff');
check(
  'a malformed colour falls back rather than throwing',
  readableOn('nonsense') === '#ffffff',
);

console.log('\n\x1b[1m<UserButton>\x1b[0m');

{
  const signedOut = render(
    clientIn({ loaded: true, user: null }),
    <UserButton />,
  );
  check(
    'it renders nothing when nobody is signed in',
    !signedOut.includes('zv-trigger'),
  );

  const signedIn = render(clientIn({ loaded: true, user: USER }), <UserButton />);
  check('an avatar appears when signed in', signedIn.includes('zv-avatar'));
  check(
    'the trigger is labelled for a screen reader',
    signedIn.includes('aria-label="Account menu for A"'),
  );
  check(
    'and announces that it opens a menu',
    signedIn.includes('aria-haspopup="menu"'),
  );
  check('the menu is closed until asked for', !signedIn.includes('Sign out'));
}

console.log('\n\x1b[1m<SignUp>\x1b[0m');

{
  const form = render(
    clientIn({ loaded: true, user: null, methods: ['password'] }),
    <SignUp />,
  );
  check('it asks for an email and a password', form.includes('Create account'));
  check(
    'the password field asks a manager to GENERATE one, not fill the old',
    form.includes('autoComplete="new-password"') ||
      form.includes('autocomplete="new-password"'),
  );
  check('the name is optional, and says so', form.includes('Optional'));

  const nothing = render(
    clientIn({ loaded: true, user: null, methods: [] }),
    <SignUp />,
  );
  check(
    'an environment with nothing enabled says so',
    nothing.includes('No sign-up methods are enabled'),
  );
}

console.log('\n\x1b[1m<OrganizationProfile>\x1b[0m');

{
  const personal = render(
    clientIn({ loaded: true, user: USER, organization: null }),
    <OrganizationProfile />,
  );
  check(
    'a personal session is told to switch first',
    personal.includes('not acting as an organization'),
  );

  const asAdmin = render(
    clientIn({
      loaded: true,
      user: USER,
      organization: {
        id: 'org_1',
        name: 'Acme',
        slug: 'acme',
        role: 'admin',
        permissions: ['org:members:manage'],
      },
    }),
    <OrganizationProfile />,
  );
  check('an admin is offered the add form', asAdmin.includes('Add a member'));
  check('and the organization is named', asAdmin.includes('Acme'));

  const asMember = render(
    clientIn({
      loaded: true,
      user: USER,
      organization: {
        id: 'org_1',
        name: 'Acme',
        slug: 'acme',
        role: 'member',
        permissions: [],
      },
    }),
    <OrganizationProfile />,
  );
  check(
    'an ordinary member is not offered it',
    !asMember.includes('Add a member'),
  );
}

console.log(
  `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`,
);
process.exit(failed === 0 ? 0 : 1);
