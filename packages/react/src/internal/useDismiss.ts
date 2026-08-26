import { useEffect, type RefObject } from 'react';

/**
 * Closes a menu the way people expect one to close.
 *
 * ── Why both, and why capture ─────────────────────────────────────
 * Escape and an outside click are the two gestures every menu is
 * expected to honour, and a menu that ignores either traps somebody in
 * an overlay they cannot dismiss. The pointer listener runs in the
 * CAPTURE phase so it fires even when the host app stops propagation on
 * its own container — which is common, and would otherwise leave the
 * menu stuck open with no way to explain it.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) onDismiss();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, isOpen, onDismiss]);
}
