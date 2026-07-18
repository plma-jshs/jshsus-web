import { useId, type HTMLAttributes, type ReactNode } from 'react';

export type FormFieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function FormField({
  label,
  children,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const classes = ['ui-field', className ?? ''].filter(Boolean).join(' ');

  return (
    <div
      {...props}
      className={classes}
      data-invalid={error ? 'true' : undefined}
      data-hint-id={hintId}
      data-error-id={errorId}
    >
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
