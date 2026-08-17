import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useAnimatedDialog } from './useAnimatedDialog';

export type DialogSize = 'sm' | 'md' | 'lg';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  closeLabel?: string;
  className?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = '대화상자 닫기',
  className,
}: DialogProps) {
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
    'ui-dialog',
    `ui-dialog--${size}`,
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
      <div className="ui-dialog__layout">
        <header className="ui-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            className="ui-dialog__close"
            type="button"
            aria-label={closeLabel}
            onClick={requestClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="ui-dialog__body" ref={bodyRef}>
          {children}
        </div>
        {footer ? <footer className="ui-dialog__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
