/**
 * The mount layer, run against the BUILT bundle in a simulated browser.
 *
 * The bundle, not the source, because the bundle is what ships: it
 * carries its own React, and a bug in how that copy is wired (two
 * Reacts, a development build, a missing portal) only exists there.
 */
import { Window } from 'happy-dom';
import { createZevAuth, type ZevAuth } from '@zevauth/js';

const window = new Window({ url: 'https://app.test/' });
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    try {
      (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key];
    } catch {
      // Read-only globals Node already owns, such as `navigator`.
    }
  }
}
Object.assign(globalThis, { window, document: window.document });

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

/** React renders on its own schedule; wait until the page says so. */
async function until(condition: () => boolean, ms = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return condition();
}

const USER = {
  id: 'user_1', email: 'ada@example.com', emailVerified: true, username: null,
  phone: null, phoneVerified: false, firstName: 'Ada', lastName: 'Lovelace',
  imageUrl: null, publicMetadata: {}, status: 'active', lastSignInAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** A client in a known state, counting how often it is asked to load. */
function stubClient(signedIn: boolean): { client: ZevAuth; loads: () => number } {
  let loads = 0;
  const client = createZevAuth({
    publishableKey: 'pk_test_x',
    apiUrl: 'https://api.test',
    fetch: (() => new Promise(() => {})) as unknown as typeof fetch,
    storage: { get: () => null, set: () => {}, remove: () => {} },
  });
  const define = (key: string, value: unknown) =>
    Object.defineProperty(client, key, { get: () => value });
  define('isLoaded', true);
  define('user', signedIn ? USER : null);
  define('organization', null);
  define('signInMethods', ['email_password', 'zevid']);
  define('isTestMode', false);
  define('environmentId', 'env_test_x');
  define('branding', {
    appName: 'Northwind', logoUrl: null, showAppName: true, showIdentity: true,
    accentColor: '#2563eb', accentOnLight: '#2563eb', accentOnDark: '#7ba4f5',
    colorScheme: 'light', borderRadius: 'medium', fontFamily: 'system', showPoweredBy: true,
  });
  client.load = async () => {
    loads++;
  };
  // The real listener reports the client's own (empty) session; this
  // one reports the fixture, as a restored session would.
  client.addListener = (listener) => {
    listener({ isLoaded: true, user: signedIn ? (USER as never) : null, organization: null });
    return () => {};
  };
  return { client, loads: () => loads };
}

async function main() {
  const ui = await import('../dist/index.js');
  const { document } = window;

  console.log('\n\x1b[1mMounting into a page that is not React\x1b[0m');
  {
    document.body.innerHTML = '<div id="sign-in"></div><div id="zevid"></div>';
    const { client, loads } = stubClient(false);
    const instance = ui.createZevAuthUI({ client });

    instance.mountSignIn('#sign-in');
    const zevid = instance.mountSignInWithZevId(document.getElementById('zevid')!, { label: 'First label' });
    const signIn = document.getElementById('sign-in')!;
    const button = document.getElementById('zevid')!;

    check('a component renders into the element it was given', await until(() => signIn.innerHTML.includes('zv-card')));
    check('a selector works as well as an element', signIn.innerHTML.includes('Sign in'));
    check('the stylesheet is added to the page', await until(() => Boolean(document.getElementById('zevauth-components'))));
    await until(() => loads() > 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    check('every mount shares one client, loaded once', loads() === 1, `loaded ${loads()} times`);

    check('props are passed through', await until(() => button.textContent?.includes('First label') ?? false));
    zevid.update({ label: 'Second label' });
    check('update changes props without remounting', await until(() => button.textContent?.includes('Second label') ?? false));

    instance.update({ appearance: { variables: { colorPrimary: '#ff5500' } } });
    check('appearance can change for everything at once', await until(() => signIn.innerHTML.includes('--zv-accent:#ff5500') || signIn.innerHTML.includes('--zv-accent: #ff5500')));

    zevid.unmount();
    check('unmount empties the element', await until(() => button.innerHTML === ''));
    check('and leaves the other mounts alone', signIn.innerHTML.includes('zv-card'));

    instance.mountSignUp('#sign-in');
    check('mounting again into an element replaces what was there', await until(() => signIn.innerHTML.includes('Create your account') && !signIn.innerHTML.includes('Forgot your password')));

    instance.destroy();
    check('destroy removes everything', await until(() => signIn.innerHTML === ''));
  }

  console.log('\n\x1b[1mThe page-wide instance, for a script tag\x1b[0m');
  {
    document.body.innerHTML = '<header id="menu"></header>';
    let threw = false;
    try { ui.mountUserButton('#menu'); } catch { threw = true; }
    check('mounting before init says what to do', threw);

    const { client } = stubClient(true);
    ui.init({ client, localization: { userButton: { signOut: 'Déconnexion' } } });
    ui.mountUserButton('#menu');
    const menu = document.getElementById('menu')!;
    check('init then mount renders the signed-in user', await until(() => menu.innerHTML.includes('Account menu for Ada Lovelace')));
    check('init returns the same instance on a second call', ui.init({ publishableKey: 'pk_other' }).client === client && ui.getClient() === client);

    (menu.querySelector('button') as unknown as { click(): void }).click();
    check('events reach components through the portal', await until(() => menu.innerHTML.includes('Déconnexion')));
  }

  console.log('\n\x1b[1mMistakes\x1b[0m');
  {
    let message = '';
    try { ui.createZevAuthUI({ client: stubClient(false).client }).mountSignIn('#nowhere'); } catch (err) { message = String(err); }
    check('a selector that matches nothing is named in the error', message.includes('#nowhere'));
    let keyless = false;
    try { ui.createZevAuthUI({}); } catch { keyless = true; }
    check('no key and no client is refused up front', keyless);
  }

  console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
  await window.happyDOM.close();
  process.exit(failed === 0 ? 0 : 1);
}

void main();
