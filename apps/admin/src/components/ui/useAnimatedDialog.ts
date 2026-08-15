import { useCallback, useEffect, useRef } from 'react';

const MOBILE_SHEET_DURATION_MS = 180;

export function useAnimatedDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;

    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      dialog.classList.remove('is-closing');
      if (!dialog.open) dialog.showModal();
      return undefined;
    }

    if (!dialog.open) return undefined;
    if (!dialog.classList.contains('is-closing') || !mobile || reducedMotion) dialog.close();
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
