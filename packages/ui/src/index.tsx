import { useSyncExternalStore, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { createZevAuth, type SessionBridgeOptions, type ZevAuth } from '@zevauth/js';
import {
  OrganizationProfile,
  OrganizationSwitcher,
  SignIn,
  SignInWithZevId,
  SignUp,
  UserButton,
  UserProfile,
  ZevAuthProvider,
  type Appearance,
  type Localization,
  type OrganizationProfileProps,
  type OrganizationSwitcherProps,
  type SignInProps,
  type SignInWithZevIdProps,
  type SignUpProps,
  type UserButtonProps,
  type UserProfileProps,
} from '@zevauth/react';

export type {
  Appearance,
  AppearanceElementKey,
  AppearanceElements,
  AppearanceVariables,
  Localization,
  ThemeName,
  ThemedColor,
  OrganizationProfileProps,
  OrganizationSwitcherProps,
  SignInProps,
  SignInWithZevIdProps,
  SignUpProps,
  UserButtonProps,
  UserProfileProps,
  ZevAuthState,
  ZevAuthUser,
} from '@zevauth/react';
export type {
  ActiveOrganization,
  OrganizationMember,
  OrganizationMembership,
  SessionBridgeOptions,
  ZevAuth,
} from '@zevauth/js';
/*
 * The client factory and error class from THIS bundle's copy of
 * `@zevauth/js`. The components check `err instanceof ZevAuthError` to
 * decide whether a message is safe to show; a client built from a
 * second copy of the package throws a different class, and every
 * server message would read "Something went wrong". Wrappers (the Vue
 * package) build their client from here for that reason.
 */
export { createZevAuth, ZevAuthError } from '@zevauth/js';

export interface ZevAuthUIOptions {
  /** `pk_test_…` or `pk_live_…`. */
  publishableKey?: string;
  /** An already-constructed client, instead of a key. */
  client?: ZevAuth;
  apiUrl?: string;
  /** How every mounted component looks. See the appearance docs. */
  appearance?: Appearance;
  /** The words every mounted component prints. */
  localization?: Localization;
  /**
   * For server-rendered pages: post every new access token to your own
   * server, which keeps it in an HttpOnly cookie. See the session bridge
   * in the docs.
   */
  sessionBridge?: SessionBridgeOptions;
}

/**
 * One mounted component.
 *
 * `update` replaces its props (merged over the current ones, so passing
 * one changes one); `unmount` removes it and leaves the element empty.
 */
export interface Mounted<P> {
  update(props: Partial<P>): void;
  unmount(): void;
}

/** An element, or a selector for one. */
export type Target = Element | string;

export interface ZevAuthUI {
  /** The one client every component from this instance shares. */
  readonly client: ZevAuth;
  mountSignIn(target: Target, props?: SignInProps): Mounted<SignInProps>;
  mountSignUp(target: Target, props?: SignUpProps): Mounted<SignUpProps>;
  mountSignInWithZevId(target: Target, props?: SignInWithZevIdProps): Mounted<SignInWithZevIdProps>;
  mountUserButton(target: Target, props?: UserButtonProps): Mounted<UserButtonProps>;
  mountUserProfile(target: Target, props?: UserProfileProps): Mounted<UserProfileProps>;
  mountOrganizationSwitcher(
    target: Target,
    props?: OrganizationSwitcherProps,
  ): Mounted<OrganizationSwitcherProps>;
  mountOrganizationProfile(
    target: Target,
    props?: OrganizationProfileProps,
  ): Mounted<OrganizationProfileProps>;
  /** Changes the appearance or wording of everything already mounted. */
  update(options: Pick<ZevAuthUIOptions, 'appearance' | 'localization'>): void;
  /** Removes every component this instance mounted. */
  destroy(): void;
}

interface Mount {
  id: number;
  target: Element;
  Component: ComponentType<object>;
  props: object;
}

/**
 * The components, for pages that are not React.
 *
 * ── One provider, many places ─────────────────────────────────────
 * Every mount is rendered from ONE React root, into its element through
 * a portal, under one `ZevAuthProvider`. The obvious alternative, a root
 * and a provider per element, gives each its own provider, and each
 * provider starts the client loading. Loads running at once each fetch
 * the environment and each try to complete a sign-in handoff or email
 * link from the URL, whose one-time code only the first can spend, so
 * the second reports a failed sign-in that in fact succeeded. One
 * provider means one load, however many components the page shows.
 *
 * The root itself renders into a detached element. Nothing of it
 * appears in the page except what the portals put there, and React
 * still delivers events, because it listens on each portal's container.
 */
export function createZevAuthUI(options: ZevAuthUIOptions): ZevAuthUI {
  const client =
    options.client ??
    (() => {
      if (!options.publishableKey) {
        throw new Error('createZevAuthUI needs a publishableKey, or a client to use instead.');
      }
      return createZevAuth({ publishableKey: options.publishableKey, apiUrl: options.apiUrl, sessionBridge: options.sessionBridge });
    })();

  let mounts: Mount[] = [];
  let config = { appearance: options.appearance, localization: options.localization };
  let root: Root | null = null;
  let nextId = 1;

  /*
   * A tiny store, read with `useSyncExternalStore`, so changing one
   * mount's props re-renders the tree without remounting anything and
   * without the host page knowing React is involved.
   */
  const listeners = new Set<() => void>();
  let snapshot = { mounts, config };
  const notify = () => {
    snapshot = { mounts, config };
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  function Host() {
    const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
    return (
      <ZevAuthProvider
        client={client}
        appearance={state.config.appearance}
        localization={state.config.localization}
      >
        {state.mounts.map((mount) =>
          createPortal(<mount.Component {...mount.props} />, mount.target, String(mount.id)),
        )}
      </ZevAuthProvider>
    );
  }

  function ensureRoot() {
    if (root) return;
    if (typeof document === 'undefined') {
      throw new Error('ZevAuth components can only be mounted in a browser.');
    }
    root = createRoot(document.createElement('div'));
    root.render(<Host />);
  }

  function resolve(target: Target): Element {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) {
      throw new Error(`No element matches "${String(target)}". Mount once the element is in the page.`);
    }
    return element;
  }

  function mount<P extends object>(Component: ComponentType<P>, target: Target, props?: P): Mounted<P> {
    const element = resolve(target);
    /*
     * Mounting twice into one element would render two components on
     * top of each other. The second mount replaces the first, which is
     * what calling mount again from a framework's re-run means.
     */
    mounts = mounts.filter((existing) => existing.target !== element);
    const id = nextId++;
    mounts = [
      ...mounts,
      { id, target: element, Component: Component as ComponentType<object>, props: { ...props } },
    ];
    ensureRoot();
    notify();

    return {
      update(next) {
        mounts = mounts.map((existing) =>
          existing.id === id ? { ...existing, props: { ...existing.props, ...next } } : existing,
        );
        notify();
      },
      unmount() {
        mounts = mounts.filter((existing) => existing.id !== id);
        notify();
      },
    };
  }

  return {
    client,
    mountSignIn: (target, props) => mount(SignIn, target, props),
    mountSignUp: (target, props) => mount(SignUp, target, props),
    mountSignInWithZevId: (target, props) => mount(SignInWithZevId, target, props),
    mountUserButton: (target, props) => mount(UserButton, target, props),
    mountUserProfile: (target, props) => mount(UserProfile, target, props),
    mountOrganizationSwitcher: (target, props) => mount(OrganizationSwitcher, target, props),
    mountOrganizationProfile: (target, props) => mount(OrganizationProfile, target, props),
    update(next) {
      config = { ...config, ...next };
      notify();
    },
    destroy() {
      mounts = [];
      notify();
      root?.unmount();
      root = null;
    },
  };
}

/*
 * ── The page-wide instance ──────────────────────────────────────────
 * For a script tag, where there is no module to hold an instance in:
 *
 *   ZevAuthUI.init({ publishableKey: 'pk_live_…' });
 *   ZevAuthUI.mountSignIn('#sign-in');
 *
 * The functions below use the instance `init` created. Apps with a
 * module system can call `createZevAuthUI` instead and keep their own.
 */
let shared: ZevAuthUI | null = null;

/** Creates the page-wide instance. Calling it again returns the same one. */
export function init(options: ZevAuthUIOptions): ZevAuthUI {
  shared ??= createZevAuthUI(options);
  return shared;
}

function current(): ZevAuthUI {
  if (!shared) {
    throw new Error('Call ZevAuthUI.init({ publishableKey }) before mounting a component.');
  }
  return shared;
}

export const mountSignIn: ZevAuthUI['mountSignIn'] = (t, p) => current().mountSignIn(t, p);
export const mountSignUp: ZevAuthUI['mountSignUp'] = (t, p) => current().mountSignUp(t, p);
export const mountSignInWithZevId: ZevAuthUI['mountSignInWithZevId'] = (t, p) =>
  current().mountSignInWithZevId(t, p);
export const mountUserButton: ZevAuthUI['mountUserButton'] = (t, p) => current().mountUserButton(t, p);
export const mountUserProfile: ZevAuthUI['mountUserProfile'] = (t, p) => current().mountUserProfile(t, p);
export const mountOrganizationSwitcher: ZevAuthUI['mountOrganizationSwitcher'] = (t, p) =>
  current().mountOrganizationSwitcher(t, p);
export const mountOrganizationProfile: ZevAuthUI['mountOrganizationProfile'] = (t, p) =>
  current().mountOrganizationProfile(t, p);

/** The page-wide client, for `getToken()`, `signOut()` and listeners. */
export function getClient(): ZevAuth {
  return current().client;
}
