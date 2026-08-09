import { useCallback, useEffect, useRef, useState } from 'react';

const MOBILE_SHEET_DURATION_MS = 180;

export function useBottomSheetClose(onClose: () => void) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const requestClose = useCallback(
    (afterClose?: () => void) => {
      if (timerRef.current !== null) return;
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!mobile || reducedMotion) {
        onClose();
        afterClose?.();
        return;
      }

      setIsClosing(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onClose();
        afterClose?.();
      }, MOBILE_SHEET_DURATION_MS);
    },
    [onClose],
  );

  const resetClosing = useCallback(() => setIsClosing(false), []);

  return { isClosing, requestClose, resetClosing };
}
