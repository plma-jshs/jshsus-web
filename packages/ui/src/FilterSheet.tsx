import { X } from 'lucide-react';
import type { ReactNode } from 'react';

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
  closeLabel,
  closeIconSize = 20,
  onClose,
}: FilterSheetProps) {
  const Title = titleAs;
  return (
    <div className={layoutClassName} id={id}>
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
