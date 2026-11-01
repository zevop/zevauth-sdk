import {
  camelize,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  type PropType,
} from 'vue';
import type { Mounted, ZevAuthUI } from '@zevauth/ui';
import { useZevAuthContext } from './plugin.js';

/* ── Control components ─────────────────────────────────────────────
 * Each renders its default slot or nothing. While the session is still
 * loading, all of them render nothing: a signed-out branch shown for a
 * moment before the session is restored is a flash of the wrong page.
 */

/** Its slot, only once somebody is signed in. */
export const SignedIn = defineComponent({
  name: 'SignedIn',
  setup(_, { slots }) {
    const { state } = useZevAuthContext('<SignedIn>');
    return () => (state.value.isLoaded && state.value.user ? slots.default?.() : null);
  },
});

/** Its slot, only once it is known that nobody is signed in. */
export const SignedOut = defineComponent({
  name: 'SignedOut',
  setup(_, { slots }) {
    const { state } = useZevAuthContext('<SignedOut>');
    return () => (state.value.isLoaded && !state.value.user ? slots.default?.() : null);
  },
});

/** Its slot while the session is still being restored. */
export const ZevAuthLoading = defineComponent({
  name: 'ZevAuthLoading',
  setup(_, { slots }) {
    const { state } = useZevAuthContext('<ZevAuthLoading>');
    return () => (state.value.isLoaded ? null : slots.default?.());
  },
});

/**
 * Its slot only for a member holding a role or permission on the active
 * organization; the `fallback` slot otherwise.
 *
 * This hides UI. It does not protect data: the same check has to exist
 * on your server, against the verified token.
 */
export const Protect = defineComponent({
  name: 'Protect',
  props: {
    role: { type: String, default: undefined },
    permission: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    const { state } = useZevAuthContext('<Protect>');
    return () => {
      const { isLoaded, user, organization } = state.value;
      if (!isLoaded) return null;
      if (!user) return slots.fallback?.() ?? null;
      if (props.role || props.permission) {
        if (!organization) return slots.fallback?.() ?? null;
        if (props.role && organization.role !== props.role) return slots.fallback?.() ?? null;
        if (props.permission && !(organization.permissions ?? []).includes(props.permission)) {
          return slots.fallback?.() ?? null;
        }
      }
      return slots.default?.();
    };
  },
});

/* ── The drop-in UI ─────────────────────────────────────────────────
 * Thin wrappers over `@zevauth/ui`: each renders an empty element and
 * mounts the component into it once the browser has it. Attributes
 * become props, kebab-case or camelCase alike, so
 * `<SignIn after-sign-in-url="/dashboard" />` means what it says.
 */

type Mounter = keyof Pick<
  ZevAuthUI,
  | 'mountSignIn'
  | 'mountSignUp'
  | 'mountSignInWithZevId'
  | 'mountUserButton'
  | 'mountUserProfile'
  | 'mountOrganizationSwitcher'
  | 'mountOrganizationProfile'
>;

function propsFrom(attrs: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    // `class` and `style` belong on the wrapper element, not the component.
    if (key === 'class' || key === 'style') continue;
    props[key === 'className' ? key : camelize(key)] = value;
  }
  return props;
}

function wrapper(name: string, mounter: Mounter, inline = false) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      /** Passed to the component's `appearance`. */
      appearance: { type: Object as PropType<Record<string, unknown>>, default: undefined },
      /** Passed to the component's `localization`. */
      localization: { type: Object as PropType<Record<string, unknown>>, default: undefined },
    },
    setup(props, { attrs }) {
      const { ui } = useZevAuthContext(`<${name}>`);
      const element = ref<HTMLElement | null>(null);
      let mounted: Mounted<Record<string, unknown>> | null = null;

      const current = () => ({
        ...propsFrom(attrs),
        ...(props.appearance ? { appearance: props.appearance } : {}),
        ...(props.localization ? { localization: props.localization } : {}),
      });

      // Browser only: `onMounted` never runs during server rendering.
      onMounted(() => {
        if (!element.value) return;
        const mount = ui()[mounter] as (el: Element, p: Record<string, unknown>) => Mounted<Record<string, unknown>>;
        mounted = mount(element.value, current());
      });
      onUpdated(() => mounted?.update(current()));
      onBeforeUnmount(() => {
        mounted?.unmount();
        mounted = null;
      });

      /*
       * A span for the controls that sit in a line of text or a header
       * (the user button, the switcher, the ZevID button), a div for the
       * screens. A div inside a flex header row is fine; a div inside a
       * paragraph is invalid markup.
       */
      return () =>
        h(inline ? 'span' : 'div', {
          ref: element,
          class: attrs.class,
          style: attrs.style,
          'data-zevauth': name,
        });
    },
  });
}

export const SignIn = wrapper('SignIn', 'mountSignIn');
export const SignUp = wrapper('SignUp', 'mountSignUp');
export const SignInWithZevId = wrapper('SignInWithZevId', 'mountSignInWithZevId', true);
export const UserButton = wrapper('UserButton', 'mountUserButton', true);
export const UserProfile = wrapper('UserProfile', 'mountUserProfile');
export const OrganizationSwitcher = wrapper('OrganizationSwitcher', 'mountOrganizationSwitcher', true);
export const OrganizationProfile = wrapper('OrganizationProfile', 'mountOrganizationProfile');
