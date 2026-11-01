import { inject, shallowRef, type App, type InjectionKey, type ShallowRef } from 'vue';
/*
 * The client comes from `@zevauth/ui`, not `@zevauth/js` directly: the
 * components are bundled with their own copy of the client package, and
 * a client from a second copy would throw an error class they do not
 * recognise. One copy, from one place.
 */
import {
  createZevAuth as createClient,
  createZevAuthUI,
  type Appearance,
  type Localization,
  type ZevAuth,
  type ZevAuthState,
  type ZevAuthUI,
} from '@zevauth/ui';

export interface ZevAuthPluginOptions {
  /** `pk_test_…` or `pk_live_…`. */
  publishableKey?: string;
  /** An already-constructed client, instead of a key. For tests. */
  client?: ZevAuth;
  apiUrl?: string;
  /** How every ZevAuth component in the app looks. */
  appearance?: Appearance;
  /** The words every ZevAuth component prints. */
  localization?: Localization;
}

export interface ZevAuthContext {
  client: ZevAuth;
  /** The session, as the client last reported it. */
  state: ShallowRef<ZevAuthState>;
  /**
   * The component layer, created the first time a component mounts, so
   * an app that only uses the composables never loads it.
   */
  ui: () => ZevAuthUI;
}

export const ZevAuthKey: InjectionKey<ZevAuthContext> = Symbol('zevauth');

const SHARED_LOAD = Symbol.for('zevauth.sharedLoad');

/**
 * Makes concurrent `load()` calls share one.
 *
 * The plugin loads the client at install, and the components (rendered
 * by `@zevauth/ui`) load it again when the first one mounts. `load()`
 * returns early only once a load has FINISHED, so a second call while
 * the first is in flight runs the whole thing again: a second
 * environment request, and a second attempt to complete a sign-in
 * handoff or email link from the URL, whose one-time code the first
 * attempt has already spent. So the in-flight promise is shared, and a
 * failed load can still be retried.
 */
function shareLoad(client: ZevAuth): void {
  const marked = client as ZevAuth & { [SHARED_LOAD]?: true };
  if (marked[SHARED_LOAD]) return;
  marked[SHARED_LOAD] = true;

  const original = client.load.bind(client);
  let pending: Promise<void> | null = null;
  client.load = () => {
    pending ??= original().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

/**
 * The Vue plugin.
 *
 * ```ts
 * import { createApp } from 'vue';
 * import { createZevAuth } from '@zevauth/vue';
 *
 * createApp(App)
 *   .use(createZevAuth({ publishableKey: import.meta.env.VITE_ZEVAUTH_KEY }))
 *   .mount('#app');
 * ```
 *
 * ── On the server ─────────────────────────────────────────────────
 * Nothing loads during server rendering (Nuxt, Vite SSR). The session
 * lives in the browser, so the server renders the "not loaded yet"
 * state, which `<SignedIn>` and `<SignedOut>` render as nothing, and the
 * browser fills it in. That is the same three-state rule as the React
 * hooks, and it is what stops a reload flashing the signed-out page.
 */
export function createZevAuth(options: ZevAuthPluginOptions) {
  return {
    install(app: App) {
      const client =
        options.client ??
        (() => {
          if (!options.publishableKey) {
            throw new Error('createZevAuth needs a publishableKey, or a client to use instead.');
          }
          return createClient({ publishableKey: options.publishableKey, apiUrl: options.apiUrl });
        })();

      shareLoad(client);

      const state = shallowRef<ZevAuthState>({
        isLoaded: client.isLoaded,
        user: client.user,
        organization: client.organization,
      });

      if (typeof window !== 'undefined') {
        /*
         * Subscribed before loading, for the reason the React provider
         * gives: `load()` reports when it finishes, and a listener
         * attached afterwards would miss it and stay "not loaded".
         */
        client.addListener((next) => {
          state.value = next;
        });
        void client.load().catch(() => {
          // An unreachable API renders as signed out, not as a crash.
        });
      }

      let ui: ZevAuthUI | null = null;

      app.provide(ZevAuthKey, {
        client,
        state,
        ui: () => {
          ui ??= createZevAuthUI({
            client,
            appearance: options.appearance,
            localization: options.localization,
          });
          return ui;
        },
      });
    },
  };
}

/**
 * The plugin's context, or a message that says what to do about it.
 *
 * Calling a composable without the plugin is the most common setup
 * mistake, and Vue's own warning for a missing injection names nothing
 * a developer can act on.
 */
export function useZevAuthContext(name: string): ZevAuthContext {
  const context = inject(ZevAuthKey, null);
  if (!context) {
    throw new Error(
      `${name} was called without the ZevAuth plugin. Add it where you create the app: ` +
        `app.use(createZevAuth({ publishableKey: 'pk_...' })).`,
    );
  }
  return context;
}
