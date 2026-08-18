import { DialogShell } from '@jshsus/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DialogCloseProvider } from './DialogCloseContext';
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
      <DialogCloseProvider onClose={requestClose}>
        <DialogShell
          className="ui-dialog__layout"
          headerClassName="ui-dialog__header"
          bodyClassName="ui-dialog__body"
          footerClassName="ui-dialog__footer"
          closeClassName="ui-dialog__close"
          title={title}
          titleId={titleId}
          description={description}
          descriptionId={descriptionId}
          bodyRef={bodyRef}
          footer={footer}
          closeLabel={closeLabel}
          onClose={requestClose}
        >
          {children}
        </DialogShell>
      </DialogCloseProvider>
    </dialog>
  );
}
