import {
  useCallback,
  useRef,
  type PointerEvent,
  type PointerEventHandler,
  type RefObject,
} from 'react';

const DEFAULT_DISMISS_DISTANCE = 72;

export type SheetDragHandleProps = {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
};

/**
 * Adds the shared mobile bottom-sheet interaction: the sheet follows the
 * pointer while dragging, snaps back when released near the top, and lets
 * the caller close it after a deliberate downward swipe.
 */
export function useSheetDrag<T extends HTMLElement = HTMLDivElement>(
  onDismiss: () => void,
  dismissDistance = DEFAULT_DISMISS_DISTANCE,
): {
  rootRef: RefObject<T>;
  handleProps: SheetDragHandleProps;
} {
  const rootRef = useRef<T | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; offset: number } | null>(null);

  const getTargets = useCallback(() => {
    const root = rootRef.current;
    if (!root) return [];
    const dialog = root.closest('dialog');
    // A native dialog already owns the sheet surface and its backdrop. Moving
    // both the dialog and its inner layout would apply the drag offset twice
    // to the content, making it outrun the white surface. Prefer the dialog
    // surface when one exists; standalone custom sheets move their root.
    return dialog ? [dialog] : [root];
  }, []);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    getTargets().forEach((target) => {
      target.classList.remove('is-dragging');
      target.style.removeProperty('--ui-sheet-drag-offset');
    });
  }, [getTargets]);

  const onPointerDown: PointerEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, offset: 0 };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      getTargets().forEach((target) => target.classList.add('is-dragging'));
    },
    [getTargets],
  );

  const onPointerMove: PointerEventHandler<HTMLElement> = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const offset = Math.max(0, event.clientY - drag.startY);
      drag.offset = offset;
      getTargets().forEach((target) => {
        target.style.setProperty('--ui-sheet-drag-offset', `${offset}px`);
      });
    },
    [getTargets],
  );

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const shouldDismiss = drag.offset >= dismissDistance;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      if (shouldDismiss) {
        onDismiss();
        resetDrag();
        return;
      }
      resetDrag();
    },
    [dismissDistance, onDismiss, resetDrag],
  );

  const onPointerCancel: PointerEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      resetDrag();
    },
    [resetDrag],
  );

  return {
    rootRef: rootRef as RefObject<T>,
    handleProps: { onPointerDown, onPointerMove, onPointerUp: finishDrag, onPointerCancel },
  };
}
