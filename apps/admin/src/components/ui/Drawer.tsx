import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useAnimatedDialog } from './useAnimatedDialog';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
  closeLabel?: string;
  className?: string;
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  closeLabel = '상세 패널 닫기',
  className,
}: DrawerProps) {
  const { ref, requestClose } = useAnimatedDialog(open, onClose);
  const titleId = useId();
  const descriptionId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const body = bodyRef.current;
    if (!body) return undefined;
    const update = () => setScrollable(body.scrollHeight > body.clientHeight + 1);
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(body);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const classes = [
    'ui-drawer',
    `ui-drawer--${side}`,
    open && scrollable ? 'is-scrollable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <dialog
      ref={ref}
      className={classes}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="ui-drawer__layout">
        <header className="ui-drawer__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            className="ui-drawer__close"
            type="button"
            aria-label={closeLabel}
            onClick={requestClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="ui-drawer__body" ref={bodyRef}>
          {children}
        </div>
        {footer ? <footer className="ui-drawer__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
