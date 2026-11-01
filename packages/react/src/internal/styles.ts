/**
 * The one stylesheet the components use.
 *
 * ── Why a stylesheet, and not inline styles ───────────────────────
 * Inline styles cannot express `:hover`, `:focus-visible`, `:disabled`
 * or a media query, and an auth form without a visible focus ring is
 * unusable by keyboard. So there has to be real CSS somewhere.
 *
 * ── Why it is injected, and not a file to import ──────────────────
 * A `import '@zevauth/react/styles.css'` is a line every developer has
 * to add, breaks in any setup that does not handle CSS imports, and is
 * the single most common "why does it look broken" support question in
 * this category. Injecting once on first render means the components
 * work the moment they are rendered, in every bundler, with no setup.
 *
 * ── Why every class is prefixed ───────────────────────────────────
 * These styles land in someone else's page. `zv-` prefixes and a
 * refusal to style bare elements mean nothing here can reach their
 * markup, and nothing of theirs accidentally reaches ours.
 *
 * ── Why the brand arrives as CSS variables ────────────────────────
 * The accent is per-environment and only known after the API answers.
 * Custom properties let one static stylesheet be repainted by setting
 * variables on a wrapper, instead of generating CSS per tenant.
 */

const STYLE_ID = 'zevauth-components';

const AUTHORED = `
.zv-root {
  --zv-radius: 8px;
  /*
   * Field and button text. Every other size is a multiple of it, so a
   * developer who changes one value gets a component in proportion
   * rather than 13.5px fields under a 22px heading.
   */
  --zv-font-size: 13.5px;
  --zv-surface: #ffffff;
  --zv-text: #18181b;
  --zv-muted: #71717a;
  --zv-border: #e4e4e7;
  --zv-field: #ffffff;
  --zv-field-text: var(--zv-text);
  --zv-error: #b91c1c;
  --zv-accent: #18181b;
  --zv-on-accent: #ffffff;

  font-family: var(--zv-font, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    Roboto, 'Helvetica Neue', Arial, sans-serif);
  color: var(--zv-text);
  /*
   * Isolated from the host page's box model. A developer with a global
   * \`* { box-sizing: content-box }\` would otherwise get fields wider
   * than their container, and it would be our bug to them.
   */
  box-sizing: border-box;
}
.zv-root *, .zv-root *::before, .zv-root *::after { box-sizing: inherit; }

.zv-root[data-theme='dark'] {
  --zv-surface: #18181b;
  --zv-text: #fafafa;
  --zv-muted: #a1a1aa;
  --zv-border: #333338;
  --zv-field: #0f0f11;
  --zv-error: #f87171;
}

/*
 * ── Host isolation ────────────────────────────────────────────────
 * Everything below states its own colour and spacing, at a specificity
 * a host page is unlikely to beat.
 *
 * The rest of this stylesheet sets colour once on \`.zv-root\` and lets
 * it inherit, which is tidy and wrong: inheritance is the WEAKEST source
 * of a value, so any host rule that targets an element directly —
 * \`h1 { color: … }\`, \`.prose strong { … }\`, a CMS theme, a CSS reset —
 * beats it and paints inside our components. It surfaced as a sign-in
 * heading rendered near-white on a white card, because the page around
 * it happened to be in dark mode.
 *
 * Not styling bare elements protects the HOST's markup from ours. This
 * is the other direction, and it needs saying explicitly.
 *
 * The doubled class is specificity, not a typo: \`.zv-root.zv-root .x\`
 * scores above the two-class-plus-element selectors that frameworks
 * generate, without resorting to \`!important\` — which would also block
 * the developer's own \`className\`.
 */
.zv-root.zv-root :where(h1, h2, h3, p, ul, ol, li, figure) {
  margin: 0;
  padding: 0;
}
.zv-root.zv-root .zv-title { color: var(--zv-text); font-size: calc(var(--zv-font-size) * 1.222); font-weight: 600; }
.zv-root.zv-root .zv-subtitle { color: var(--zv-muted); font-size: calc(var(--zv-font-size) * 0.963); }
.zv-root.zv-root .zv-appname { color: var(--zv-muted); font-size: calc(var(--zv-font-size) * 0.926); }
.zv-root.zv-root .zv-label { color: var(--zv-text); font-size: calc(var(--zv-font-size) * 0.926); font-weight: 500; }
.zv-root.zv-root .zv-hint { color: var(--zv-muted); font-size: calc(var(--zv-font-size) * 0.852); }
.zv-root.zv-root .zv-fielderror { color: var(--zv-error); font-size: calc(var(--zv-font-size) * 0.852); }
.zv-root.zv-root .zv-divider { color: var(--zv-muted); font-size: calc(var(--zv-font-size) * 0.852); }
.zv-root.zv-root .zv-notice { color: var(--zv-muted); }
.zv-root.zv-root .zv-alert { color: var(--zv-error); }
.zv-root.zv-root .zv-testmode { color: var(--zv-muted); }
.zv-root.zv-root .zv-menu-name,
.zv-root.zv-root .zv-member-name { color: var(--zv-text); }
.zv-root.zv-root .zv-menu-sub,
.zv-root.zv-root .zv-menu-label { color: var(--zv-muted); }
.zv-root.zv-root .zv-menu-item { color: var(--zv-text); }
/* Initials sit on the accent. A host rule colouring spans (our docs'
   own \`.prose\` reset did) painted them in the text colour, invisible
   on a dark accent. */
.zv-root.zv-root .zv-avatar { color: var(--zv-on-accent); }
/* Typography resets commonly give \`hr\` a large margin; ours is a hairline
   between sections and keeps its own. */
.zv-root.zv-root .zv-section-divider { margin: 2px 0; }
.zv-root.zv-root .zv-input { color: var(--zv-field-text); }
.zv-root.zv-root .zv-image-preview { color: var(--zv-muted); }
.zv-root.zv-root .zv-button[data-variant='primary'] { color: var(--zv-on-accent); }
.zv-root.zv-root .zv-button[data-variant='secondary'] { color: var(--zv-text); }
.zv-root.zv-root .zv-button[data-variant='ghost'] { color: var(--zv-muted); }
/*
 * Focus is ours too. Every control below draws its own ring with a
 * box-shadow, and most host pages also put a global outline on
 * \`:focus-visible\` (design systems, Tailwind presets, our own docs).
 * The plain \`outline: none\` on each control is too weak to beat those,
 * so a focused field showed two rings, ours inside theirs with a gap
 * between. Stated here at the isolation block's strength.
 */
.zv-root.zv-root :is(.zv-input, .zv-button, .zv-more, .zv-trigger, .zv-menu-item):focus-visible {
  outline: none;
}
.zv-root.zv-root .zv-poweredby,
.zv-root.zv-root .zv-poweredby strong {
  color: var(--zv-muted);
  text-decoration: none;
  font-size: calc(var(--zv-font-size) * 0.815);
}
.zv-root.zv-root .zv-poweredby strong { font-weight: 600; }

.zv-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  /*
   * A stated width, capped on small screens.
   *
   * This was \`width: 100%; max-width: 380px\`, which reads as the same
   * thing and is not. A percentage resolves against the parent, and
   * \`.zv-root\` has no width of its own — so anywhere it becomes a
   * flex or grid ITEM it shrinks to fit its content, the percentage
   * resolves against that, and the card collapses into a tall thin
   * column. It looked correct only because the common case puts it in a
   * block container that happens to be wide.
   *
   * A fixed width does not depend on the parent at all, and
   * \`max-width: 100%\` still keeps it inside a narrow one.
   */
  width: var(--zv-card-width, 380px);
  max-width: 100%;
  /*
   * Named so a part can reach the card's edge: the footer band in the
   * \`soft\` theme pulls itself out by exactly the padding, and still
   * lines up when a flat card sets it to zero.
   */
  --zv-card-px: 26px;
  --zv-card-py: 28px;
  padding: var(--zv-card-py) var(--zv-card-px);
  background: var(--zv-surface);
  border: 1px solid var(--zv-border);
  border-radius: calc(var(--zv-radius) * 1.5);
  box-shadow: var(--zv-card-shadow, none);
}

/*
 * A wider card, for the settings-style screens.
 *
 * A class rather than an inline \`maxWidth\`: with a stated \`width\` on
 * the base rule, an inline max-width can only ever make a card
 * narrower, so the two silently disagreed and the wide screens rendered
 * at the narrow size.
 */
.zv-card[data-size='wide'] { width: var(--zv-card-width, 460px); }

/*
 * Blended into the page rather than drawn as a card.
 *
 * A developer who has already designed the panel this sits in gets a
 * box inside a box otherwise — the same duplication the identity block
 * had, and the same fix: let them turn our chrome off.
 *
 * The width stays. It is what keeps the fields a readable measure, and
 * dropping it here would make a flat form stretch to whatever container
 * it landed in.
 */
.zv-card[data-chrome='flat'] {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  --zv-card-px: 0px;
  --zv-card-py: 0px;
}

/*
 * Vertical placement inside a pane.
 *
 * Centering is right on a full-height sign-in page and wrong inside an
 * app shell, where a fixed header and a centered form end up on top of
 * each other.
 */
.zv-formpane[data-align='top'] { align-items: flex-start; }

/*
 * The split screen: form on one side, a picture on the other.
 *
 * \`data-form\` names where the FORM goes, because that is the thing a
 * developer is positioning. The aside is rendered first and flipped
 * with \`order\`, so the markup stays one shape rather than two branches
 * that can disagree.
 *
 * \`100dvh\` rather than \`100vh\`: on mobile browsers \`vh\` includes the
 * address bar that is not there, so the form sat below the fold until
 * you scrolled.
 */
.zv-split {
  display: grid;
  /*
   * \`min-width: 0\`, here and on the pane, is what lets the card's
   * \`max-width: 100%\` mean anything on a phone.
   *
   * A grid item's minimum width defaults to \`auto\`, which is "never
   * narrower than my content". The card's stated 380px IS that content,
   * so on a 360px screen the pane settled at 380px plus padding, the
   * card's max-width resolved against a parent already wider than the
   * viewport, and the page scrolled sideways with the submit button cut
   * off. The single-column media query below changes the columns, not
   * the minimum, so it did not help. Reported from a 360px Android.
   */
  min-width: 0;
  grid-template-columns: 1fr 1fr;
  min-height: 100dvh;
  width: 100%;
}
.zv-split[data-form='left'] .zv-aside { order: 2; }
.zv-formpane {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
}
.zv-aside {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 44px 40px;
  background: var(--zv-accent);
  color: var(--zv-on-accent);
}
.zv-aside-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* A scrim, so the copy stays readable over any photograph rather than
   only over the ones that happen to be dark at the bottom. */
/*
 * Only over a photograph. A gradient panel is already dark where the
 * text sits, and stacking a second scrim on it turns the corner to mud.
 */
.zv-aside-body[data-scrim='true']::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,0) 55%);
  pointer-events: none;
}
/* The panel's own paint, so BrandedAside can set a per-tenant colour
   without the stylesheet knowing anything about it. */
.zv-aside-fill {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 44px 40px;
}
.zv-aside-body { position: relative; }
.zv-root.zv-root .zv-aside-heading {
  position: relative;
  margin: 0;
  font-size: calc(var(--zv-font-size) * 1.704);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.015em;
  color: inherit;
}
.zv-root.zv-root .zv-aside-text {
  position: relative;
  margin: 8px 0 0;
  font-size: var(--zv-font-size);
  line-height: 1.55;
  opacity: 0.88;
  color: inherit;
}
/*
 * Hidden below 900px, not stacked. Stacking puts the picture above the
 * form, which pushes the one thing somebody came to do below the fold
 * on the smallest screens.
 */
@media (max-width: 900px) {
  .zv-split { grid-template-columns: 1fr; min-height: 0; }
  .zv-aside { display: none; }
  .zv-formpane { padding: 24px 16px; }
}

.zv-identity { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.zv-logo { max-height: 30px; max-width: 170px; object-fit: contain; }
.zv-appname { font-size: calc(var(--zv-font-size) * 0.926); color: var(--zv-muted); }
.zv-title { margin: 0; font-size: calc(var(--zv-font-size) * 1.222); font-weight: 600; text-align: center; letter-spacing: -0.01em; }
.zv-subtitle { margin: 0; font-size: calc(var(--zv-font-size) * 0.963); line-height: 1.5; color: var(--zv-muted); text-align: center; }

.zv-fields { display: flex; flex-direction: column; gap: 12px; }
.zv-field { display: flex; flex-direction: column; gap: 5px; }
.zv-label { font-size: calc(var(--zv-font-size) * 0.926); font-weight: 500; }

.zv-input {
  width: 100%;
  padding: 9px 11px;
  font: inherit;
  font-size: var(--zv-font-size);
  color: var(--zv-field-text);
  background: var(--zv-field);
  /*
   * Its own token rather than the shared border, so a theme can drop or
   * darken field outlines while focus and \`aria-invalid\` below still
   * repaint them. An inline style would have won over both states.
   */
  border: 1px solid var(--zv-field-border, var(--zv-border));
  border-radius: var(--zv-radius);
  outline: none;
  transition: border-color .12s ease, box-shadow .12s ease;
}
.zv-input:focus-visible {
  /*
   * A ring, never a removed outline — but a QUIET one.
   *
   * This was a 3px halo plus a border darkened all the way to the
   * accent. With a near-black accent that reads as a heavy double
   * border, and the field looks broken rather than focused. 2px at a
   * lower opacity, with the border only lifted to a mid tone, says the
   * same thing without shouting it.
   */
  border-color: color-mix(in srgb, var(--zv-accent) 45%, var(--zv-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--zv-accent) 14%, transparent);
}
.zv-input[aria-invalid='true'] { border-color: var(--zv-error); }
.zv-input:disabled { opacity: .55; cursor: not-allowed; }

.zv-hint { font-size: calc(var(--zv-font-size) * 0.852); color: var(--zv-muted); }
.zv-fielderror { font-size: calc(var(--zv-font-size) * 0.852); color: var(--zv-error); }

/*
 * The picture row: a preview, then the actions beside it.
 *
 * Wraps rather than shrinking. In a narrow card the buttons drop under
 * the preview, which is legible; a preview squeezed to nothing beside
 * two buttons is not.
 */
.zv-image-field {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.zv-image-preview {
  flex: none;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--zv-border);
  /* Derived, not a new token: it has to be a touch off the card in
     both themes, and mixing the border into the surface does that
     without another variable to keep in step. */
  background: color-mix(in srgb, var(--zv-border) 30%, var(--zv-surface));
}
.zv-image-preview[data-shape='circle'] { border-radius: 999px; }
.zv-image-preview[data-shape='square'] { border-radius: var(--zv-radius); }
.zv-image-preview img { width: 100%; height: 100%; object-fit: cover; }
/* The placeholder silhouette. Stroked, so it reads at 56px. */
.zv-image-preview svg {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  opacity: .6;
}
.zv-image-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
  flex: 1;
}
.zv-image-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
/*
 * The buttons here size to their text. Every other button in these
 * components is full width because it is the one action on a form; two
 * side by side would each be half a card wide and read as a choice
 * between equals, which Replace and Remove are not.
 */
.zv-image-buttons .zv-button[data-shape='pill'] { border-radius: 999px; }
.zv-button[data-shape='square'] { border-radius: 0; }
.zv-image-buttons .zv-button { width: auto; padding: 7px 12px; font-size: calc(var(--zv-font-size) * 0.926); }

.zv-progress {
  height: 4px;
  border-radius: 999px;
  background: var(--zv-border);
  overflow: hidden;
}
.zv-progress span {
  display: block;
  height: 100%;
  background: var(--zv-accent);
  transition: width .15s ease;
}

.zv-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 9px 14px;
  font: inherit;
  font-size: var(--zv-font-size);
  font-weight: 500;
  border-radius: var(--zv-radius);
  border: 1px solid transparent;
  cursor: pointer;
  transition: opacity .12s ease, background-color .12s ease;
}
.zv-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--zv-accent) 22%, transparent);
}
.zv-button:disabled { opacity: .55; cursor: not-allowed; }
.zv-button[data-variant='primary'] { background: var(--zv-accent); color: var(--zv-on-accent); }
.zv-button[data-variant='primary']:hover:not(:disabled) { opacity: .9; }
.zv-button[data-variant='secondary'] {
  background: transparent; color: var(--zv-text); border-color: var(--zv-border);
}
.zv-button[data-variant='secondary']:hover:not(:disabled) { background: var(--zv-border); }
.zv-button[data-variant='ghost'] {
  background: transparent; color: var(--zv-muted); border: 0; width: auto; padding: 4px 2px;
  font-size: calc(var(--zv-font-size) * 0.926); text-decoration: underline;
}

.zv-divider { display: flex; align-items: center; gap: 10px; color: var(--zv-muted); font-size: calc(var(--zv-font-size) * 0.852); }
.zv-divider::before, .zv-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--zv-border);
}

.zv-alert {
  padding: 9px 11px;
  font-size: calc(var(--zv-font-size) * 0.926);
  line-height: 1.45;
  border-radius: var(--zv-radius);
  border: 1px solid color-mix(in srgb, var(--zv-error) 35%, transparent);
  color: var(--zv-error);
  background: color-mix(in srgb, var(--zv-error) 8%, transparent);
}

.zv-notice {
  padding: 9px 11px; font-size: calc(var(--zv-font-size) * 0.926); line-height: 1.45;
  border-radius: var(--zv-radius);
  border: 1px dashed var(--zv-border); color: var(--zv-muted);
}

.zv-footer { display: flex; justify-content: center; gap: 5px; font-size: calc(var(--zv-font-size) * 0.926); color: var(--zv-muted); }

.zv-poweredby {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  font-size: calc(var(--zv-font-size) * 0.815); color: var(--zv-muted); text-decoration: none;
}
.zv-poweredby:hover { opacity: .8; }

.zv-testmode {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 5px 9px; font-size: calc(var(--zv-font-size) * 0.852); color: var(--zv-muted);
  border: 1px dashed var(--zv-border); border-radius: var(--zv-radius);
}
.zv-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }

.zv-spinner {
  width: 14px; height: 14px; border-radius: 999px;
  border: 2px solid currentColor; border-top-color: transparent;
  animation: zv-spin .6s linear infinite;
}
@keyframes zv-spin { to { transform: rotate(360deg); } }

/* ── Collapsing sections ───────────────────────────────────────── */
/*
 * Animating \`grid-template-rows\` transitions to the content's real
 * height. The usual \`max-height\` workaround needs a guess: guess low
 * and tall content clips, guess high and most of the duration animates
 * empty space, which reads as laggy.
 */
.zv-reveal {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows .25s ease, opacity .25s ease;
}
.zv-reveal[data-open='true'] { grid-template-rows: 1fr; opacity: 1; }
/* \`min-height: 0\` is what lets a grid row actually collapse. */
.zv-reveal > * { min-height: 0; overflow: hidden; }

@media (prefers-reduced-motion: reduce) {
  .zv-reveal { transition: none; }
}

.zv-more {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 6px; font: inherit; font-size: calc(var(--zv-font-size) * 0.926);
  color: var(--zv-muted); background: transparent; border: 0;
  cursor: pointer; border-radius: var(--zv-radius);
}
.zv-more:hover { color: var(--zv-text); }
.zv-more:focus-visible {
  outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--zv-accent) 22%, transparent);
}
.zv-chevron { transition: transform .2s ease; }
.zv-more[aria-expanded='true'] .zv-chevron { transform: rotate(180deg); }

.zv-section-divider {
  height: 1px; background: var(--zv-border); border: 0; margin: 2px 0;
}

/* ── Organization members ──────────────────────────────────────── */
.zv-member-list { display: flex; flex-direction: column; }
.zv-member {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 7px 0;
}
.zv-member-name { font-size: calc(var(--zv-font-size) * 0.963); min-width: 0; }
.zv-member .zv-button { width: auto; }

/* ── Menus ─────────────────────────────────────────────────────── */
.zv-menu-wrap { position: relative; display: inline-block; }

.zv-trigger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 6px; font: inherit; font-size: calc(var(--zv-font-size) * 0.963); color: var(--zv-text);
  background: transparent; border: 1px solid transparent;
  border-radius: var(--zv-radius); cursor: pointer;
}
.zv-trigger:hover { background: color-mix(in srgb, var(--zv-border) 60%, transparent); }
.zv-trigger:focus-visible {
  outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--zv-accent) 30%, transparent);
}

.zv-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; flex: 0 0 28px;
  border-radius: 999px; overflow: hidden;
  background: var(--zv-accent); color: var(--zv-on-accent);
  font-size: calc(var(--zv-font-size) * 0.852); font-weight: 600; letter-spacing: .01em;
}
.zv-avatar img { width: 100%; height: 100%; object-fit: cover; }

.zv-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 50;
  min-width: 232px; padding: 6px;
  display: flex; flex-direction: column; gap: 2px;
  background: var(--zv-surface);
  border: 1px solid var(--zv-border);
  border-radius: calc(var(--zv-radius) * 1.25);
  box-shadow: 0 8px 28px rgba(0,0,0,.14);
}
.zv-menu-header {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 8px 10px; border-bottom: 1px solid var(--zv-border); margin-bottom: 4px;
}
.zv-menu-name { font-size: calc(var(--zv-font-size) * 0.963); font-weight: 500; }
.zv-menu-sub { font-size: calc(var(--zv-font-size) * 0.852); color: var(--zv-muted); }
.zv-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 168px; }

.zv-menu-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 8px; font: inherit; font-size: calc(var(--zv-font-size) * 0.963); text-align: left;
  color: var(--zv-text); background: transparent; border: 0;
  border-radius: var(--zv-radius); cursor: pointer;
}
.zv-menu-item:hover:not(:disabled) { background: color-mix(in srgb, var(--zv-border) 60%, transparent); }
.zv-menu-item:focus-visible {
  outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--zv-accent) 40%, transparent);
}
.zv-menu-item[aria-current='true'] { font-weight: 600; }
.zv-menu-item:disabled { opacity: .6; cursor: default; }
.zv-menu-label {
  padding: 6px 8px 3px; font-size: calc(var(--zv-font-size) * 0.778); text-transform: uppercase;
  letter-spacing: .06em; color: var(--zv-muted);
}

/* ── Added in 0.2.7 ──────────────────────────────────────────────
 * Everything below targets classes and attributes that only the new
 * components and opt-in props render, so no existing screen can pick
 * any of it up.
 */
.zv-root.zv-root .zv-section-title { color: var(--zv-text); font-size: var(--zv-font-size); font-weight: 600; }
.zv-root.zv-root .zv-nav-item { color: var(--zv-muted); }
.zv-root.zv-root .zv-nav-item[aria-current='page'] { color: var(--zv-text); }
.zv-root.zv-root .zv-badge { color: var(--zv-muted); }
.zv-root.zv-root .zv-list-item { color: var(--zv-text); }
.zv-root.zv-root .zv-list-item[data-kind='create'] { color: var(--zv-muted); }
.zv-root.zv-root .zv-button[data-variant='danger'] { color: var(--zv-error); }
.zv-root.zv-root :is(.zv-nav-item, .zv-list-item):focus-visible { outline: none; }

.zv-button[data-variant='danger'] {
  background: transparent;
  border-color: color-mix(in srgb, var(--zv-error) 40%, var(--zv-border));
}
.zv-button[data-variant='danger']:hover:not(:disabled) {
  background: color-mix(in srgb, var(--zv-error) 8%, transparent);
}

/* A labelled block inside a profile: a heading, then its rows. */
.zv-section { display: flex; flex-direction: column; gap: 12px; }
.zv-section-title { margin: 0; }
.zv-section-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}

.zv-badge {
  display: inline-flex; align-items: center;
  padding: 1px 7px;
  font-size: calc(var(--zv-font-size) * 0.815); font-weight: 500;
  border: 1px solid var(--zv-border);
  border-radius: 999px;
  white-space: nowrap;
}

/* ── Sidebar layout (opt-in: variant="sidebar") ─────────────────── */
/*
 * The card loses its own padding and the two panes carry it, so the
 * navigation can be tinted edge to edge. Width is a token like the
 * other cards, and the layout stacks on narrow screens rather than
 * squeezing the form beside a column of links.
 */
.zv-card[data-layout='sidebar'] {
  /*
   * Fluid up to its width, unlike the narrow cards. At 760px a fixed
   * width overflows most of the places a settings screen sits (a
   * dialog, a content column beside an app's own navigation), and the
   * grid's minimum content is small enough that the card can shrink
   * without collapsing.
   */
  width: 100%;
  max-width: var(--zv-card-width, 760px);
  padding: 0;
  gap: 0;
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  overflow: hidden;
}
.zv-nav {
  display: flex; flex-direction: column; gap: 2px;
  padding: 22px 12px;
  background: color-mix(in srgb, var(--zv-border) 22%, var(--zv-surface));
  border-right: 1px solid var(--zv-border);
}
.zv-nav-heading { padding: 0 10px 14px; display: flex; flex-direction: column; gap: 2px; }
.zv-nav-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 10px; font: inherit; font-size: calc(var(--zv-font-size) * 0.963);
  text-align: left; background: transparent; border: 0;
  border-radius: var(--zv-radius); cursor: pointer;
}
.zv-nav-item:hover { background: color-mix(in srgb, var(--zv-border) 45%, transparent); }
.zv-nav-item[aria-current='page'] {
  font-weight: 500;
  background: color-mix(in srgb, var(--zv-border) 60%, transparent);
}
.zv-nav-item:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--zv-accent) 35%, transparent); }
.zv-panel {
  display: flex; flex-direction: column; gap: 18px;
  padding: var(--zv-card-py) var(--zv-card-px);
  min-width: 0;
}
@media (max-width: 720px) {
  .zv-card[data-layout='sidebar'] { grid-template-columns: 1fr; }
  .zv-nav {
    flex-direction: row; flex-wrap: wrap; padding: 10px;
    border-right: 0; border-bottom: 1px solid var(--zv-border);
  }
  .zv-nav-heading { display: none; }
  .zv-nav-item { width: auto; }
}

/* ── Active devices ─────────────────────────────────────────────── */
.zv-session-list { display: flex; flex-direction: column; }
.zv-session {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 0;
}
.zv-session + .zv-session { border-top: 1px solid var(--zv-border); }
.zv-session .zv-button { width: auto; }
.zv-session-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* ── Chooser list (OrganizationList) ────────────────────────────── */
/*
 * Rows run to the card's edges, separated by hairlines, the way an
 * account chooser reads: one decision per row, nothing else competing.
 */
.zv-list {
  display: flex; flex-direction: column;
  margin: 0 calc(var(--zv-card-px) * -1);
  border-top: 1px solid var(--zv-border);
}
.zv-list-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 12px var(--zv-card-px);
  font: inherit; font-size: calc(var(--zv-font-size) * 0.963); font-weight: 500;
  text-align: left; background: transparent; border: 0;
  border-bottom: 1px solid var(--zv-border);
  cursor: pointer;
}
.zv-list-item:hover:not(:disabled) { background: color-mix(in srgb, var(--zv-border) 30%, transparent); }
.zv-list-item:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--zv-accent) 35%, transparent); }
.zv-list-item:disabled { cursor: default; opacity: .6; }
.zv-list-item[data-kind='create'] { font-weight: 400; color: var(--zv-muted); }
/* The plus in a dashed ring: present, but quieter than a real account. */
.zv-list-plus {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; flex: 0 0 28px;
  border: 1px dashed var(--zv-border); border-radius: 999px;
}
.zv-avatar[data-shape='square'] { border-radius: var(--zv-radius); }

/* ── Dialog (opt-in: UserButton userProfileMode="modal") ────────── */
.zv-modal-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 6vh 16px 16px;
  overflow-y: auto;
  background: rgba(0, 0, 0, .4);
}
.zv-modal {
  position: relative;
  max-width: 100%;
  border-radius: calc(var(--zv-radius) * 1.5);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .2);
}
.zv-modal:focus { outline: none; }
.zv-modal-close {
  position: absolute; top: 10px; right: 10px; z-index: 1;
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  color: var(--zv-muted); background: transparent; border: 0;
  border-radius: var(--zv-radius); cursor: pointer;
}
.zv-modal-close:hover { color: var(--zv-text); background: color-mix(in srgb, var(--zv-border) 50%, transparent); }
.zv-root.zv-root .zv-modal-close:focus-visible {
  outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--zv-accent) 35%, transparent);
}

/* An animation that respects somebody who asked for less of it. */
@media (prefers-reduced-motion: reduce) {
  .zv-spinner { animation-duration: 2s; }
  .zv-input, .zv-button { transition: none; }
}
`;

/**
 * The authored CSS, minus the explanations.
 *
 * The comments above are for whoever maintains this. They were shipping
 * to every visitor of every page that renders a component: 3.1kB of
 * rationale, 24% of the stylesheet, on an auth screen that should be
 * fast. Stripping happens once per process, so the source stays
 * readable and the bytes stay home.
 *
 * Deliberately conservative. It removes block comments and collapses
 * runs of whitespace, and does not touch spacing around punctuation —
 * `color-mix(in srgb, var(--zv-accent) 22%, transparent)` is one bad
 * regex away from breaking, and the saving is not worth the risk.
 *
 * This assumes no CSS string or `url()` contains the sequence that ends
 * a comment. None does; if one ever must, it needs escaping or this
 * needs a real parser.
 */
const CSS = AUTHORED.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The stylesheet, optionally inside a cascade layer.
 *
 * For server rendering with `cssLayerName`: the inlined `<style>` has
 * to be the same layered CSS the runtime would add, or the page changes
 * which rules win the moment it hydrates.
 */
export function getComponentStyles(options: { cssLayerName?: string } = {}): string {
  const layer = options.cssLayerName?.trim();
  if (!layer) return CSS;
  /*
   * A layer name is an identifier; anything else would let a stray
   * brace from a config value close the block early and leave the rest
   * of the stylesheet unlayered, which fails silently.
   */
  if (!/^[A-Za-z_][\w.-]*$/.test(layer)) {
    throw new Error(
      `cssLayerName "${layer}" is not a valid CSS layer name. Use letters, digits, "-", "_" or ".".`,
    );
  }
  return `@layer ${layer}{${CSS}}`;
}

let injected = false;

/**
 * Injects the stylesheet once per document.
 *
 * Guarded by an id as well as a module flag: two copies of the package
 * in one page — a real possibility with transitive dependencies — would
 * otherwise each inject their own, and the second would silently win.
 *
 * The layer is read on the first call only. The stylesheet is shared by
 * every component on the page, so it cannot be in one layer for one
 * component and another for the next; that is why `cssLayerName`
 * belongs on the provider.
 */
export function ensureStyles(cssLayerName?: string): void {
  if (injected) return;
  if (typeof document === 'undefined') return;

  injected = true;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = getComponentStyles({ cssLayerName });
  document.head.appendChild(style);
}

/** Exposed so the SSR path can inline the same CSS without a document. */
export const componentStyles = CSS;
export const componentStyleId = STYLE_ID;
