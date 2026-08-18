import { X } from 'lucide-react';
import { useSheetDrag } from './useSheetDrag';
import { type ReactNode } from 'react';

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
  const { rootRef, handleProps } = useSheetDrag<HTMLDivElement>(onClose);

  return (
    <div
      className={layoutClassName}
      id={id}
      ref={rootRef}
      role={role}
      aria-modal={ariaModal || undefined}
      aria-label={ariaLabel}
    >
      <span className="ui-filter-sheet__handle" aria-hidden="true" {...handleProps} />
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
