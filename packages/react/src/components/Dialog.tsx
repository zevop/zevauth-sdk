import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Branding } from '@zevauth/js';
import type { ElementResolver, MergedAppearance } from '../internal/appearance.js';
import type { Strings } from '../internal/localization.js';
import { Brandable } from './Brandable.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog over the page, for a screen opened from a menu.
 *
 * ── Why it is portalled ───────────────────────────────────────────
 * The trigger usually lives in a header with `overflow: hidden` or its
 * own stacking context, and a fixed overlay rendered inside one is
 * clipped or sits under the page. On `document.body` it is above
 * everything. It brings its own `Brandable`, because outside the
 * component's root the tokens and theme would not reach it.
 *
 * ── What it owes a keyboard and a screen reader ───────────────────
 * Focus moves in on open and back to the trigger on close; Tab cycles
 * inside; Escape and a click on the backdrop close it; the page behind
 * stops scrolling. Without these a dialog is a trap or a leak, and
 * both are reported as "the modal is broken".
 */
export function Dialog({
  label,
  closeLabel,
  onClose,
  branding,
  appearance,
  el,
  strings,
  returnFocusRef,
  children,
}: {
  label: string;
  /**
   * Where focus goes on close. Needed when the control that opened the
   * dialog lives in a menu that has since closed: the element focused
   * at open is gone, and focus would fall to the page.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  closeLabel: string;
  onClose: () => void;
  branding: Branding | null;
  appearance: MergedAppearance;
  el: ElementResolver;
  strings: Strings;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    // The first field, not the close button: the person opened this to
    // do something in it.
    const first = [...(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find(
      (node) => !node.classList.contains('zv-modal-close') && !node.closest('[inert]'),
    );
    (first ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => !node.closest('[inert]'),
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef?.current ?? returnTo;
      if (target?.isConnected) target.focus();
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <Brandable branding={branding} appearance={appearance} el={el} strings={strings}>
      <div
        {...el('modalBackdrop')}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          {...el('modal')}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
        >
          <button type="button" className="zv-modal-close" aria-label={closeLabel} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {children}
        </div>
      </div>
    </Brandable>,
    document.body,
  );
}
