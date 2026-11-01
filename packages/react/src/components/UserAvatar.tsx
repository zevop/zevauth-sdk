import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { displayNameOf, initials } from '../internal/people.js';
import { Brandable } from './Brandable.js';

export interface UserAvatarProps {
  /** Width and height in pixels. Defaults to 28, the size `<UserButton>` uses. */
  size?: number;
  /**
   * How this one component looks, merged over the provider's
   * `appearance`. The picture is the `avatar` element, and `userAvatar`
   * addresses this component's alone.
   */
  appearance?: Appearance;
  className?: string;
}

/**
 * The signed-in person's picture, or their initials.
 *
 * For a header, a comment box or a "signed in as" line where the full
 * `<UserButton>` menu would be too much. Renders nothing when nobody is
 * signed in, like the button.
 */
export function UserAvatar({ size = 28, appearance, className }: UserAvatarProps) {
  const {
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<UserAvatar>', appearance);

  if (!state.isLoaded || !state.user) return null;

  const name = displayNameOf(state.user);
  const sized =
    size === 28
      ? undefined
      : { width: size, height: size, flexBasis: size, fontSize: Math.round(size * 0.41) };

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <span {...el(['avatar', 'userAvatar'], sized)} role="img" aria-label={name}>
        {state.user.imageUrl ? <img src={state.user.imageUrl} alt="" /> : initials(name)}
      </span>
    </Brandable>
  );
}
