import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import type { Localization } from '../internal/localization.js';
import { Brandable } from './Brandable.js';
import { ZevMark } from './parts.js';

export interface SignInWithZevIdProps {
  /** Where to return after signing in. Defaults to the current page. */
  redirectUrl?: string;
  label?: string;
  /** `secondary` (default) suits a row of provider buttons. */
  variant?: 'primary' | 'secondary';
  /**
   * The corner shape. `default` follows your branding radius; `pill` is
   * fully rounded; `square` has no radius. For dropping onto a member
   * portal that already has its own button language.
   */
  shape?: 'default' | 'pill' | 'square';
  /**
   * How this one component looks, merged over the provider's
   * `appearance`. See `Appearance` for the console fields, `variables`
   * and `elements`.
   */
  appearance?: Appearance;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
  className?: string;
}

/**
 * Just the ZevID button, for a form you built yourself.
 *
 * ── Why this exists separately from `<SignIn>` ────────────────────
 * `<SignIn>` is the whole screen, and plenty of products do not want
 * one: they have a sign-in page they have already designed, and they
 * want SSO as one option inside it. Making them adopt our entire form to
 * get our SSO button would be charging a design tax for a feature, and
 * most would write their own button against
 * `client.signIn.withZevId()` instead — which works, and then quietly
 * misses the mark, the loading state and whatever we add later.
 *
 * So the button is available on its own. It carries no card, no
 * identity block and no attribution, because it is a control inside
 * somebody else's layout rather than a screen of ours.
 */
export function SignInWithZevId({
  redirectUrl,
  label,
  variant = 'secondary',
  shape = 'default',
  appearance,
  localization,
  className,
}: SignInWithZevIdProps) {
  const {
    client,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<SignInWithZevId>', appearance, localization);

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <button
        type="button"
        {...el(['button', variant === 'primary' ? 'buttonPrimary' : 'buttonSecondary', 'zevIdButton'])}
        data-variant={variant}
        data-shape={shape === 'default' ? undefined : shape}
        onClick={() => client.signIn.withZevId({ redirectUrl })}
      >
        <ZevMark size={13} />
        {label ?? strings.common.continueWithZevId}
      </button>
    </Brandable>
  );
}
