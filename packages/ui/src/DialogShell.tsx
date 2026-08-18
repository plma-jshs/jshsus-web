import { X } from 'lucide-react';
import { useRef, type PointerEvent, type ReactNode, type Ref } from 'react';

export type DialogShellProps = {
  title: ReactNode;
  titleId: string;
  description?: ReactNode;
  descriptionId?: string;
  children: ReactNode;
  footer?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  className: string;
  headerClassName: string;
  bodyClassName: string;
  footerClassName: string;
  closeClassName: string;
  closeLabel: string;
  onClose: () => void;
};

/** Shared dialog/drawer layout. Surface wrappers own the native shell and animation. */
export function DialogShell({
  title,
  titleId,
  description,
  descriptionId,
  children,
  footer,
  bodyRef,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
  closeClassName,
  closeLabel,
  onClose,
}: DialogShellProps) {
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
    <div className={className}>
      <span
        className="ui-dialog__handle"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      <header className={headerClassName}>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <button className={closeClassName} type="button" aria-label={closeLabel} onClick={onClose}>
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      <div className={bodyClassName} ref={bodyRef}>
        {children}
      </div>
      {footer ? <footer className={footerClassName}>{footer}</footer> : null}
    </div>
  );
}
