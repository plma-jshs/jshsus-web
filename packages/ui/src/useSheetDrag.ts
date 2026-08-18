import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type PointerEventHandler,
  type RefObject,
} from 'react';

// A short accidental swipe should snap back. Requiring a little more travel
// makes the close gesture deliberate without making the handle feel heavy.
const DEFAULT_DISMISS_DISTANCE = 104;
const SHEET_EXIT_DURATION_MS = 180;

/**
 * Clear a sheet's snap-back marker before an external close starts.
 *
 * A snap-back intentionally keeps `is-snapping` on the surface so native
 * dialog open animations are not replayed.  If the backdrop is then clicked
 * while that marker is still present, the marker's `animation: none` rule can
 * win over the exit animation.  Callers that close a sheet from outside the
 * drag handle use this small shared cleanup helper first.
 */
export function clearSheetSnapStates(scope?: ParentNode) {
  if (typeof document === 'undefined') return;
  const candidates = scope
    ? [
        ...(scope instanceof HTMLElement && scope.classList.contains('is-snapping') ? [scope] : []),
        ...Array.from(scope.querySelectorAll<HTMLElement>('.is-snapping')),
      ]
    : Array.from(document.querySelectorAll<HTMLElement>('.is-snapping'));

  candidates.forEach((target) => {
    target.classList.remove('is-snapping');
    // A snap-back normally clears this after the transition.  Clear it here
    // as well when no active drag is in progress so an immediate backdrop
    // close cannot inherit a stale transform offset.
    if (!target.classList.contains('is-dragging')) {
      target.style.removeProperty('--ui-sheet-drag-offset');
    }
  });
}

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
  const cleanupTimerRef = useRef<number | null>(null);
  const cleanupFrameRef = useRef<number | null>(null);

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

  const clearCleanup = useCallback(() => {
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (cleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(cleanupFrameRef.current);
      cleanupFrameRef.current = null;
    }
  }, []);

  const resetDrag = useCallback(() => {
    clearCleanup();
    dragRef.current = null;
    getTargets().forEach((target) => {
      target.classList.remove('is-dragging');
      target.classList.remove('is-snapping');
      target.style.removeProperty('--ui-sheet-drag-offset');
    });
  }, [clearCleanup, getTargets]);

  const snapBack = useCallback(() => {
    const targets = getTargets();
    if (!targets.length) {
      resetDrag();
      return;
    }

    // Keep the dragged offset for one frame, then let the normal transform
    // transition carry the surface back to rest. Clearing the offset while
    // `is-dragging` still disables transitions would visibly snap it upward.
    cleanupFrameRef.current = window.requestAnimationFrame(() => {
      cleanupFrameRef.current = null;
      targets.forEach((target) => {
        target.classList.add('is-snapping');
        target.classList.remove('is-dragging');
      });
      // Keep `is-snapping` on the surface after the transition. Native
      // dialogs have an `[open]` enter animation; removing the class here
      // would replay that animation and flash the sheet after it has already
      // settled. A new pointer-down or unmount reset clears the class.
      cleanupTimerRef.current = window.setTimeout(() => {
        cleanupTimerRef.current = null;
        dragRef.current = null;
        targets.forEach((target) => {
          target.style.removeProperty('--ui-sheet-drag-offset');
        });
      }, SHEET_EXIT_DURATION_MS);
    });
  }, [getTargets, resetDrag]);

  const onPointerDown: PointerEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      if (cleanupFrameRef.current !== null) {
        window.cancelAnimationFrame(cleanupFrameRef.current);
        cleanupFrameRef.current = null;
      }
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, offset: 0 };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      getTargets().forEach((target) => {
        target.classList.remove('is-snapping');
        target.style.setProperty('--ui-sheet-drag-offset', '0px');
        target.classList.add('is-dragging');
      });
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
        // Keep the last drag offset through the close animation. Clearing it
        // synchronously makes the sheet snap back to its resting position
        // before the exit animation starts.
        onDismiss();
        // Let the close state land before dropping is-dragging. This avoids a
        // one-frame snap to the top of the sheet before the exit keyframe.
        cleanupFrameRef.current = window.requestAnimationFrame(() => {
          cleanupFrameRef.current = null;
          getTargets().forEach((target) => {
            target.classList.remove('is-dragging');
          });
          cleanupTimerRef.current = window.setTimeout(() => {
            cleanupTimerRef.current = null;
            resetDrag();
          }, SHEET_EXIT_DURATION_MS);
        });
        return;
      }
      snapBack();
    },
    [dismissDistance, getTargets, onDismiss, resetDrag, snapBack],
  );

  const onPointerCancel: PointerEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      snapBack();
    },
    [snapBack],
  );

  // Remove custom drag state if the owner unmounts while a gesture is closing.
  // This is also useful for native dialogs that are closed immediately when
  // reduced motion is enabled.
  useEffect(() => resetDrag, [resetDrag]);

  return {
    rootRef: rootRef as RefObject<T>,
    handleProps: { onPointerDown, onPointerMove, onPointerUp: finishDrag, onPointerCancel },
  };
}
