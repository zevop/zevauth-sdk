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
function clientIn(state: {
  loaded: boolean;
  user?: typeof USER | null;
  organization?: { id: string; name: string; slug: string | null; role: string; permissions?: string[] } | null;
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

console.log(
  `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`,
);
process.exit(failed === 0 ? 0 : 1);
