import { useCallback, useEffect, useRef } from 'react';
import { clearSheetSnapStates } from './useSheetDrag';

const MOBILE_SHEET_DURATION_MS = 180;

/** Shared native-dialog open/close animation behavior for dialogs and sheets. */
export function useAnimatedDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;

    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      dialog.classList.remove('is-closing');
      if (!dialog.open) dialog.showModal();
      return undefined;
    }

    if (!dialog.open) return undefined;
    clearSheetSnapStates(dialog);
    if (!mobile || reducedMotion) {
      dialog.close();
      dialog.classList.remove('is-closing');
      return undefined;
    }

    if (!dialog.classList.contains('is-closing')) {
      dialog.classList.add('is-closing');
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        dialog.close();
        dialog.classList.remove('is-closing');
      }, MOBILE_SHEET_DURATION_MS);
    }
    return undefined;
  }, [open]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    const dialog = ref.current;
    if (!dialog || timerRef.current !== null) return;
    // A sheet may have just completed a snap-back gesture. Clear only the
    // settled marker before starting the exit animation; an active drag's
    // offset is intentionally preserved so a deliberate swipe exits from
    // the point where the user released it.
    clearSheetSnapStates(dialog);
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!mobile || reducedMotion || !dialog.open) {
      onClose();
      return;
    }

    dialog.classList.add('is-closing');
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      dialog.close();
      dialog.classList.remove('is-closing');
      onClose();
    }, MOBILE_SHEET_DURATION_MS);
  }, [onClose]);

  return { ref, requestClose };
}
