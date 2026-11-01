import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Linking, useColorScheme } from 'react-native';
import {
  createZevAuth,
  type AsyncSessionStorageAdapter,
  type Branding,
  type CryptoAdapter,
  type HandoffError,
  type IncomingUrlResult,
  type ZevAuth,
  type ZevAuthState,
} from '@zevauth/js';
import {
  ZevAuthProvider as BaseProvider,
  mergeLocalization,
  type Localization,
  type Strings,
} from '@zevauth/react/headless';
import { expoCrypto, secureStoreStorage, systemBrowser, type AuthBrowser } from './adapters.js';
import { resolveTheme, type NativeAppearance, type ResolvedTheme } from './theme.js';
import { nativeEn, type NativeLocalization, type NativeStrings } from './strings.js';

export interface ZevAuthProviderProps {
  publishableKey?: string;
  /** An already-constructed client, for tests or a custom setup. */
  client?: ZevAuth;
  apiUrl?: string;
  /**
   * Where sign-ins return to this app: a universal link (iOS) / app link
   * (Android) on your verified domain in production, e.g.
   * `https://acme.example/auth/callback`, or a custom scheme such as
   * `acme://auth/callback` in development only. Register it in the
   * ZevAuth console under Domains & callbacks, and the app under Mobile
   * apps.
   */
  redirectUrl: string;
  appearance?: NativeAppearance;
  /** The same shape as the web's, plus a `native` group for phone-only wording. */
  localization?: Localization & NativeLocalization;
  /** Keychain/Keystore by default. Replace for a bare React Native app. */
  storage?: AsyncSessionStorageAdapter;
  /** expo-crypto by default. */
  crypto?: CryptoAdapter;
  /** The system authentication session by default. */
  browser?: AuthBrowser;
  children: ReactNode;
}

interface NativeContextValue {
  client: ZevAuth;
  state: ZevAuthState;
  redirectUrl: string;
  browser: AuthBrowser;
  branding: Branding | null;
  appearance: NativeAppearance | undefined;
  theme: ResolvedTheme;
  strings: Strings;
  native: NativeStrings;
  /** A sign-in that came back failed, for `<SignIn>` to show. */
  handoffError: HandoffError | null;
  clearHandoffError(): void;
  /** Hands a link to the client once; the same URL twice is ignored. */
  handleUrl(url: string): Promise<IncomingUrlResult | null>;
}

const NativeContext = createContext<NativeContextValue | null>(null);

/**
 * One ZevAuth client for the app, kept in step with React Native.
 *
 * ── Built on the web provider, not beside it ──────────────────────
 * The hooks (`useUser`, `useAuth`, …) and control components come from
 * `@zevauth/react/headless`, the DOM-free half of the web package. This
 * provider creates a client fitted for a phone and hands it to that
 * provider, so a hook behaves identically on web and native, and a fix
 * to one is a fix to both.
 *
 * ── What it adds for a phone ──────────────────────────────────────
 * The session in the Keychain/Keystore, links the app is opened with
 * (sign-in links, ZevID returns) finished automatically, and the session
 * re-checked whenever the app comes back to the foreground.
 */
export function ZevAuthProvider({
  publishableKey,
  client: provided,
  apiUrl,
  redirectUrl,
  appearance,
  localization,
  storage,
  crypto,
  browser = systemBrowser,
  children,
}: ZevAuthProviderProps) {
  const clientRef = useRef<ZevAuth | null>(provided ?? null);
  if (!clientRef.current) {
    if (!publishableKey) {
      throw new Error('<ZevAuthProvider> needs a publishableKey, or a client to use instead.');
    }
    clientRef.current = createZevAuth({
      publishableKey,
      apiUrl,
      asyncStorage: storage ?? secureStoreStorage,
      crypto: crypto ?? expoCrypto,
    });
  }
  const client = clientRef.current;

  /*
   * Mirrored here as well as in the base provider, because the native
   * screens need the second-factor and pending-task state, which the
   * shared hooks do not expose.
   */
  const [state, setState] = useState<ZevAuthState>(() => ({
    isLoaded: client.isLoaded,
    user: client.user,
    organization: client.organization,
    secondFactor: client.secondFactor,
    pendingTasks: client.pendingTasks,
  }));
  useEffect(() => client.addListener(setState), [client]);

  const [handoffError, setHandoffError] = useState<HandoffError | null>(null);
  const handled = useRef(new Set<string>());

  const handleUrl = useCallback(
    async (url: string) => {
      /*
       * Once per URL. On Android a ZevID return can arrive twice: as the
       * auth session's result and as a link event. The second would find
       * the PKCE verifier already spent and show a false error.
       */
      if (!url) return null;
      // Keyed by the one-time code or token when there is one: the
      // duplicate can arrive with a different URL around the same code.
      const key = /[?&](code|zv_token)=([^&#]+)/.exec(url)?.[2] ?? url;
      if (handled.current.has(key)) return null;
      handled.current.add(key);
      const result = await client.handleIncomingUrl(url);
      if (result.status === 'error') {
        client.takeHandoffError();
        setHandoffError(result.error);
      } else if (result.status !== 'ignored') {
        // A universal link can return while the sheet is still up.
        browser.dismiss?.();
      }
      return result;
    },
    [client, browser],
  );

  useEffect(() => {
    let active = true;
    void Linking.getInitialURL().then((url) => {
      if (active && url) void handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', (event) => void handleUrl(event.url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void client.revalidate().then(() => {
        // A session past its ZevID fresh-sign-in window says why.
        const error = client.takeHandoffError();
        if (error) setHandoffError(error);
      });
    });
    return () => subscription.remove();
  }, [client]);

  const systemScheme = useColorScheme();
  const branding = useMemo(() => brandingWith(client.branding, appearance), [client, state.isLoaded, appearance]);
  const theme = useMemo(
    () => resolveTheme(branding, appearance, systemScheme),
    [branding, appearance, systemScheme],
  );
  const strings = useMemo(() => mergeLocalization(localization), [localization]);
  const native = useMemo(() => ({ ...nativeEn, ...localization?.native }), [localization]);

  const value = useMemo<NativeContextValue>(
    () => ({
      client,
      state,
      redirectUrl,
      browser,
      branding,
      appearance,
      theme,
      strings,
      native,
      handoffError,
      clearHandoffError: () => setHandoffError(null),
      handleUrl,
    }),
    [client, state, redirectUrl, browser, branding, appearance, theme, strings, native, handoffError, handleUrl],
  );

  return (
    <BaseProvider client={client} localization={localization}>
      <NativeContext.Provider value={value}>{children}</NativeContext.Provider>
    </BaseProvider>
  );
}

/** Console branding with the developer's console-field overrides; the badge stays the server's. */
function brandingWith(branding: Branding | null, appearance: NativeAppearance | undefined): Branding | null {
  if (!branding || !appearance) return branding;
  const { theme: _t, colorScheme, variables: _v, elements: _e, ...fields } = appearance;
  return {
    ...branding,
    ...fields,
    ...(colorScheme ? { colorScheme } : {}),
    appName: branding.appName,
    showPoweredBy: branding.showPoweredBy,
  };
}

export function useNativeContext(name: string): NativeContextValue {
  const value = useContext(NativeContext);
  if (!value) {
    throw new Error(
      `${name} was used outside a <ZevAuthProvider> from @zevauth/expo. Wrap your app in one, usually in the root layout.`,
    );
  }
  return value;
}
