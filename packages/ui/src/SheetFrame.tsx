import { useSheetDrag } from './useSheetDrag';
import { type ReactNode } from 'react';

export type SheetFrameProps = {
  children: ReactNode;
  className: string;
  handleClassName: string;
  id?: string;
  header?: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'region' | 'menu';
  ariaModal?: boolean;
  ariaLabel?: string;
  onClose: () => void;
};

/**
 * Low-level surface shared by filter, detail, create, and action sheets.
 * Layout-specific wrappers keep their own body/footer classes, while the
 * handle and pointer gesture always use the same implementation.
 */
export function SheetFrame({
  children,
  className,
  handleClassName,
  id,
  header,
  footer,
  role,
  ariaModal,
  ariaLabel,
  onClose,
}: SheetFrameProps) {
  const { rootRef, handleProps } = useSheetDrag<HTMLDivElement>(onClose);

  return (
    <div
      className={className}
      id={id}
      ref={rootRef}
      role={role}
      aria-modal={ariaModal || undefined}
      aria-label={ariaLabel}
    >
      <span className={handleClassName} aria-hidden="true" {...handleProps} />
      {header}
      {children}
      {footer}
    </div>
  );
}
