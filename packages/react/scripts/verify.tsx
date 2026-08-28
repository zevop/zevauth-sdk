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
import { UserProfile } from '../src/components/UserProfile';
import { SignInWithZevId } from '../src/components/SignInWithZevId';
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
  showAppName: true, showIdentity: true,
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
  Object.defineProperty(client, 'me', {
    get: () => ({
      fetch: async () => ({ user: null, organizations: [], organization: null }),
      update: async () => null,
      changePassword: async () => ({ otherSessionsRevoked: 0 }),
      requestEmailChange: async ({ newEmail }: { newEmail: string }) => ({
        pendingEmail: newEmail,
      }),
      cancelEmailChange: async () => {},
    }),
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
    clientIn({ loaded: true, user: null, methods: ['email_password'] }),
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
      methods: ['email_password', 'magic_link', 'email_otp', 'zevid'],
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

console.log('\n\x1b[1mWhere the ZevID button sits\x1b[0m');

{
  const both = { loaded: true, user: null, methods: ['email_password', 'zevid'] } as const;

  const inline = render(clientIn({ ...both }), <SignIn />);
  const zevIdBeforeForm =
    inline.indexOf('Continue with ZevID') < inline.indexOf('type="password"');
  check('inline keeps ZevID above the form, as it always has', zevIdBeforeForm, 'order changed');

  /*
   * The reported bug: with only a password and ZevID enabled, the prop
   * did nothing, because its condition asked for magic link or email
   * code. A product whose users mostly have passwords had no way to put
   * the form first.
   */
  const collapsed = render(
    clientIn({ ...both }),
    <SignIn secondaryMethods="collapsed" />,
  );
  check(
    'collapsed puts the form first and ZevID after it',
    collapsed.indexOf('type="password"') < collapsed.indexOf('Continue with ZevID'),
    'ZevID is still first',
  );
  check('and offers the toggle', collapsed.includes('More options'));
  check('with ZevID folded away behind it', collapsed.includes('data-open="false"'));
  check('but still rendered, so the toggle can animate', collapsed.includes('Continue with ZevID'));

  // Nothing to be secondary TO means nothing moves.
  const zevIdOnly = render(
    clientIn({ loaded: true, user: null, methods: ['zevid'] }),
    <SignIn secondaryMethods="collapsed" />,
  );
  check(
    'ZevID alone stays primary, with no toggle hiding the only way in',
    zevIdOnly.includes('Continue with ZevID') && !zevIdOnly.includes('More options'),
  );
}

console.log('\n\x1b[1mThe words above the form\x1b[0m');

{
  const custom = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['email_password'],
      branding: { signInTitle: 'Log in to Andapool', signInSubtitle: 'Welcome back.' },
    }),
    <SignIn />,
  );
  check('the title comes from the console', custom.includes('Log in to Andapool'), custom.slice(0, 200));
  check('and so does the subtitle', custom.includes('Welcome back.'));
  // Scoped to the heading: the submit button still reads "Sign in",
  // and it should.
  check(
    'the heading is the custom one, not ours',
    custom.includes('zv-title">Log in to Andapool') && !custom.includes('zv-title">Sign in<'),
    custom.slice(0, 240),
  );

  const hidden = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['email_password'],
      branding: { signInTitle: null, signInSubtitle: null },
    }),
    <SignIn />,
  );
  check('a null title prints no heading at all', !hidden.includes('zv-title'));
  check('and no subtitle', !hidden.includes('zv-subtitle'));
  check('while the form stays', hidden.includes('type="password"'));

  /*
   * The distinction that matters: absent is not the same as null. An
   * API older than this feature sends neither field, and the component
   * has to keep printing its own wording rather than going blank.
   */
  const legacy = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['email_password'],
      branding: { signInTitle: undefined, signInSubtitle: undefined },
    }),
    <SignIn />,
  );
  check('an API that sends neither field still prints the default title', legacy.includes('Sign in'));

  const signUp = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['email_password'],
      branding: { signUpTitle: 'Join Andapool', signUpSubtitle: 'It takes a minute.' },
    }),
    <SignUp />,
  );
  check('sign-up takes its own title', signUp.includes('Join Andapool'), signUp.slice(0, 200));
  check('and its own subtitle', signUp.includes('It takes a minute.'));
}

console.log('\n\x1b[1mHiding the logo and name\x1b[0m');

{
  const off = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['email_password'],
      branding: { showIdentity: false },
    }),
    <SignIn />,
  );
  check('the identity block is gone when it is turned off', !off.includes('zv-identity'));
  check('but the form is still there', off.includes('type="password"'), off.slice(0, 160));

  /*
   * An API that predates this field sends nothing. Absent has to mean
   * "show", or upgrading this package before the backend ships would
   * delete the logo of every app that took the update.
   */
  const legacy = render(
    clientIn({
      loaded: true,
      user: null,
      methods: ['email_password'],
      branding: { showIdentity: undefined },
    }),
    <SignIn />,
  );
  check('an API that does not send the field still shows the identity', legacy.includes('zv-identity'));
}

console.log('\n\x1b[1mBranding and attribution\x1b[0m');

{
  const branded = render(
    clientIn({ loaded: true, user: null, methods: ['email_password'] }),
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
      methods: ['email_password'],
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
      methods: ['email_password'],
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
    clientIn({ loaded: true, user: null, methods: ['email_password'], isTestMode: true }),
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

console.log('\n\x1b[1mSecondary methods: inline vs collapsed\x1b[0m');

{
  // `email_password` is the API's key. These fixtures said `password`
  // and so did the component, so they agreed with each other and neither
  // agreed with the wire — which is why a broken sign-in box passed.
  const all = { loaded: true, user: null, methods: ['email_password', 'magic_link', 'email_otp'] };

  const inline = render(clientIn(all), <SignIn />);
  check('inline is the default', inline.includes('data-open="true"'));
  check('and it is not behind a toggle', !inline.includes('More options'));

  const collapsed = render(clientIn(all), <SignIn secondaryMethods="collapsed" />);
  check('collapsed offers a toggle', collapsed.includes('More options'));
  check('the alternatives start folded', collapsed.includes('data-open="false"'));
  check(
    'and are out of the tab order while folded',
    /inert/.test(collapsed),
  );
  check(
    'but still rendered, so the toggle can animate',
    collapsed.includes('Email me a code'),
  );
  check(
    'the toggle reports its state to a screen reader',
    collapsed.includes('aria-expanded="false"'),
  );

  // With only one method there is nothing to fold, so no toggle.
  const onlyPassword = render(
    clientIn({ loaded: true, user: null, methods: ['email_password'] }),
    <SignIn secondaryMethods="collapsed" />,
  );
  check(
    'no toggle when there is nothing to collapse',
    !onlyPassword.includes('More options'),
  );
}

console.log('\n\x1b[1m<SignInWithZevId> on its own\x1b[0m');

{
  const button = render(
    clientIn({ loaded: true, user: null, methods: ['zevid'] }),
    <SignInWithZevId />,
  );
  check('it renders a button', button.includes('zv-button'));
  check('carrying the Zev mark', button.includes('495.23 347'));
  check('with no card around it', !button.includes('zv-card'));
  check(
    'and no attribution, since it sits in your layout',
    !button.includes('Secured by'),
  );

  const custom = render(
    clientIn({ loaded: true, user: null, methods: ['zevid'] }),
    <SignInWithZevId label="Sign in with ZevID" variant="primary" />,
  );
  check('the label is yours to set', custom.includes('Sign in with ZevID'));
  check('so is the variant', custom.includes('data-variant="primary"'));
}

console.log('\n\x1b[1m<UserProfile> sections\x1b[0m');

{
  const both = render(clientIn({ loaded: true, user: USER }), <UserProfile />);
  check('all shows the profile fields', both.includes('First name'));
  check('and the password disclosure', both.includes('Change password'));
  check('with the password fields closed', both.includes('data-open="false"'));

  const open = render(
    clientIn({ loaded: true, user: USER }),
    <UserProfile defaultPasswordOpen />,
  );
  check('they can start open', open.includes('data-open="true"'));

  const profileOnly = render(
    clientIn({ loaded: true, user: USER }),
    <UserProfile section="profile" />,
  );
  check('profile alone omits the password section', !profileOnly.includes('Change password'));
  check('and keeps the name fields', profileOnly.includes('First name'));

  check(
    'the current address is shown, read-only',
    /zv-input[^>]*readonly/i.test(both) || both.includes('readOnly'),
  );
  check(
    'changing it is offered as a flow, not an editable field',
    both.includes('Change your email address'),
  );
  check(
    'and those fields start folded and out of the tab order',
    (both.match(/data-open="false"/g) ?? []).length >= 2 && /inert/.test(both),
    `${(both.match(/data-open="false"/g) ?? []).length} folded sections`,
  );
  check(
    'the copy says the address does not change until the link is opened',
    /does not change[\s\S]{0,40}until you open it/.test(both),
  );

  const securityOnly = render(
    clientIn({ loaded: true, user: USER }),
    <UserProfile section="security" />,
  );
  check('security alone omits the name fields', !securityOnly.includes('First name'));
  check('and keeps the password section', securityOnly.includes('Change password'));
}

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
    clientIn({ loaded: true, user: null, methods: ['email_password'] }),
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
