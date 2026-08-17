import { X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

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
  return (
    <div className={className}>
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
