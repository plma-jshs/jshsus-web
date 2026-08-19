import { X } from 'lucide-react';
import { SheetFrame } from './SheetFrame';
import { type ReactNode, type Ref } from 'react';

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
  showCloseButton?: boolean;
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
  showCloseButton = true,
  onClose,
}: DialogShellProps) {
  return (
    <SheetFrame
      className={className}
      handleClassName="ui-dialog__handle"
      onClose={onClose}
      header={
        <header className={headerClassName}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {showCloseButton ? (
            <button
              className={closeClassName}
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <X size={19} aria-hidden="true" />
            </button>
          ) : null}
        </header>
      }
      footer={footer ? <footer className={footerClassName}>{footer}</footer> : undefined}
    >
      <div className={bodyClassName} ref={bodyRef}>
        {children}
      </div>
    </SheetFrame>
  );
}
