import { X } from 'lucide-react';
import { useRef, type ReactNode, type Ref, type TouchEvent } from 'react';

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
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLSpanElement>) => {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLSpanElement>) => {
    const startY = touchStartY.current;
    touchStartY.current = null;
    const endY = event.changedTouches[0]?.clientY;
    if (startY !== null && endY !== undefined && endY - startY > 64) onClose();
  };

  return (
    <div className={className}>
      <span
        className="ui-dialog__handle"
        aria-hidden="true"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
