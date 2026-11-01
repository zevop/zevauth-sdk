/**
 * The Vue package in a simulated browser: plugin, composables, control
 * components, and the drop-in UI mounted through `@zevauth/ui`.
 */
import { Window } from 'happy-dom';

const window = new Window({ url: 'https://app.test/' });
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    try {
      (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key];
    } catch {
      // Read-only globals Node already owns.
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

async function main() {
  const { createApp, defineComponent, h, nextTick, ref } = await import('vue');
  const ui = await import('@zevauth/ui');
  const zv = await import('../src/index');

  /*
   * A client that starts unloaded and loads when told to, so the test
   * can see each of the three states, and that counts its loads.
   */
  function stub() {
    let listener: ((state: unknown) => void) | null = null;
    let state = { isLoaded: false, user: null as typeof USER | null, organization: null as unknown };
    let loads = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const client = ui.createZevAuth({
      publishableKey: 'pk_test_x',
      apiUrl: 'https://api.test',
      fetch: (() => new Promise(() => {})) as unknown as typeof fetch,
      storage: { get: () => null, set: () => {}, remove: () => {} },
    });
    const define = (key: string, get: () => unknown) => Object.defineProperty(client, key, { get });
    define('isLoaded', () => state.isLoaded);
    define('user', () => state.user);
    define('organization', () => state.organization);
    define('signInMethods', () => ['email_password']);
    define('isTestMode', () => false);
    define('environmentId', () => 'env_test_x');
    define('branding', () => ({
      appName: 'Northwind', logoUrl: null, showAppName: true, showIdentity: true,
      accentColor: '#2563eb', accentOnLight: '#2563eb', accentOnDark: '#7ba4f5',
      colorScheme: 'light', borderRadius: 'medium', fontFamily: 'system', showPoweredBy: true,
    }));
    client.addListener = (next) => {
      listener = next as (state: unknown) => void;
      next(state as never);
      return () => { listener = null; };
    };
    client.load = async () => {
      loads++;
      await gate;
    };
    client.getToken = async () => (state.user ? 'token_1' : null);

    return {
      client,
      loads: () => loads,
      finishLoading(user: typeof USER | null, organization: unknown = null) {
        state = { isLoaded: true, user, organization };
        release();
        listener?.(state);
      },
    };
  }

  console.log('\n\x1b[1mPlugin, composables and control components\x1b[0m');
  {
    const fake = stub();
    const seen: Record<string, unknown> = {};
    const App = defineComponent({
      setup() {
        const { isLoaded, isSignedIn, user } = zv.useUser();
        const { userId, getToken } = zv.useAuth();
        const token = ref<string | null>(null);
        return () => {
          seen.isLoaded = isLoaded.value;
          seen.isSignedIn = isSignedIn.value;
          seen.userId = userId.value;
          seen.getToken = getToken;
          return h('main', [
            h(zv.ZevAuthLoading, () => h('p', { id: 'loading' }, 'Loading')),
            h(zv.SignedOut, () => h('p', { id: 'out' }, 'Signed out')),
            h(zv.SignedIn, () => h('p', { id: 'in' }, `Hello ${user.value?.firstName}`)),
            h(zv.Protect, { permission: 'org:billing:manage' }, {
              default: () => h('p', { id: 'billing' }, 'Billing'),
              fallback: () => h('p', { id: 'no-billing' }, 'Ask an admin'),
            }),
            h('p', { id: 'token' }, token.value ?? ''),
          ]);
        };
      },
    });

    document.body.innerHTML = '<div id="app"></div>';
    createApp(App).use(zv.createZevAuth({ client: fake.client })).mount('#app');
    const html = () => document.getElementById('app')!.innerHTML;

    check('before loading, only the loading slot renders', html().includes('Loading') && !html().includes('Signed out') && !html().includes('Hello'));
    check('isLoaded and isSignedIn start false, not "signed out"', seen.isLoaded === false && seen.isSignedIn === false);

    fake.finishLoading(USER);
    await nextTick();
    check('once loaded, the signed-in slot renders with the user', html().includes('Hello Ada') && !html().includes('Loading'));
    check('composables follow the session', seen.isSignedIn === true && seen.userId === 'user_1');
    check('Protect shows its fallback without the permission', html().includes('Ask an admin') && !html().includes('>Billing<'));
    check('getToken reaches the client', (await (seen.getToken as () => Promise<string | null>)()) === 'token_1');
  }

  console.log('\n\x1b[1mThe drop-in components\x1b[0m');
  {
    const fake = stub();
    const show = ref(true);
    const url = ref('/one');
    const App = defineComponent({
      setup() {
        return () =>
          h('div', [
            show.value
              ? h(zv.SignInWithZevId, { label: url.value, class: 'my-zevid' })
              : null,
            h(zv.SignIn, { 'after-sign-in-url': url.value, appearance: { variables: { colorPrimary: '#ff5500' } } }),
          ]);
      },
    });
    document.body.innerHTML = '<div id="app2"></div>';
    createApp(App).use(zv.createZevAuth({ client: fake.client, localization: { signIn: { submit: 'Entrer' } } })).mount('#app2');
    fake.finishLoading(null);
    const root = document.getElementById('app2')!;

    check('a component mounts into its own element', await until(() => root.innerHTML.includes('zv-card')));
    check('the plugin’s localization reaches it', root.innerHTML.includes('Entrer'));
    check('an appearance prop reaches it', root.innerHTML.includes('#ff5500'));
    check('class stays on the wrapper element', root.querySelector('.my-zevid') !== null);
    check('the plugin and the components share one load', fake.loads() === 1, `loaded ${fake.loads()} times`);

    url.value = '/two';
    await nextTick();
    check('changed props reach the mounted component', await until(() => root.textContent?.includes('/two') ?? false));

    show.value = false;
    await nextTick();
    check('removing it unmounts it', await until(() => root.querySelector('[data-zevauth="SignInWithZevId"]') === null && !(root.textContent ?? '').includes('/two')));
  }

  console.log('\n\x1b[1mMistakes\x1b[0m');
  {
    let message = '';
    const Lonely = defineComponent({ setup() { zv.useUser(); return () => null; } });
    const app = createApp(Lonely);
    app.config.warnHandler = () => {};
    app.config.errorHandler = (err) => { message = String(err); };
    document.body.innerHTML = '<div id="app3"></div>';
    app.mount('#app3');
    check('a composable without the plugin names the fix', message.includes('app.use(createZevAuth'));
  }

  console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
  await window.happyDOM.close();
  process.exit(failed === 0 ? 0 : 1);
}

void main();
