import { X } from 'lucide-react';
import { useRef, type PointerEvent, type ReactNode } from 'react';

export type FilterSheetProps = {
  title: ReactNode;
  titleAs?: 'h2' | 'strong';
  id?: string;
  children: ReactNode;
  footer?: ReactNode;
  layoutClassName: string;
  headerClassName?: string;
  titleClassName?: string;
  closeClassName?: string;
  footerClassName?: string;
  role?: 'dialog' | 'region';
  ariaModal?: boolean;
  ariaLabel?: string;
  closeLabel: string;
  closeIconSize?: number;
  onClose: () => void;
};

/** Shared filter-sheet layout. Surface wrappers own the dialog/scrim shell. */
export function FilterSheet({
  title,
  titleAs = 'h2',
  id,
  children,
  footer,
  layoutClassName,
  headerClassName,
  titleClassName,
  closeClassName,
  footerClassName,
  role,
  ariaModal,
  ariaLabel,
  closeLabel,
  closeIconSize = 20,
  onClose,
}: FilterSheetProps) {
  const Title = titleAs;
  const pointerStartY = useRef<number | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStartY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    const startY = pointerStartY.current;
    pointerStartY.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (startY !== null && event.clientY - startY > 56) onClose();
  };

  const handlePointerCancel = (event: PointerEvent<HTMLSpanElement>) => {
    pointerStartY.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  return (
    <div
      className={layoutClassName}
      id={id}
      role={role}
      aria-modal={ariaModal || undefined}
      aria-label={ariaLabel}
    >
      <span
        className="ui-filter-sheet__handle"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      <header className={headerClassName}>
        <Title className={titleClassName}>{title}</Title>
        <button className={closeClassName} type="button" aria-label={closeLabel} onClick={onClose}>
          <X size={closeIconSize} aria-hidden="true" />
        </button>
      </header>
      {children}
      {footer ? <footer className={footerClassName}>{footer}</footer> : null}
    </div>
  );
}
