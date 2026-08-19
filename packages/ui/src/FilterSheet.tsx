import { SheetFrame } from './SheetFrame';
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
  footerClassName?: string;
  role?: 'dialog' | 'region';
  ariaModal?: boolean;
  ariaLabel?: string;
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
  footerClassName,
  role,
  ariaModal,
  ariaLabel,
  onClose,
}: FilterSheetProps) {
  const Title = titleAs;

  return (
    <SheetFrame
      className={layoutClassName}
      handleClassName="ui-filter-sheet__handle"
      id={id}
      role={role}
      aria-modal={ariaModal || undefined}
      aria-label={ariaLabel}
      onClose={onClose}
      header={
        <header className={headerClassName}>
          <Title className={titleClassName}>{title}</Title>
        </header>
      }
      footer={footer ? <footer className={footerClassName}>{footer}</footer> : undefined}
    >
      {children}
    </SheetFrame>
  );
}
