import { useId, type ReactNode } from 'react';
import { cx } from './utils';

export interface FormCardProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * Form "details card" (design 06/07: 353 wide, r 16, surface): stacks 52 px form rows
 * (`SelectRow variant="inset"`, `FormRow`) with 16 px-inset hairlines between them.
 */
export function FormCard({ children, className, ...aria }: FormCardProps) {
  return (
    <div className={cx('homi-card homi-form-card', className)} data-radius="small" role="group" {...aria}>
      {children}
    </div>
  );
}

export interface FormRowProps {
  /** Row label (`body`), e.g. "Menge". */
  label: string;
  /** Trailing control (e.g. a compact `QuantityStepper`), right-aligned with 16 px padding. */
  children: ReactNode;
  /** Id of the control, so the label can point at it. */
  htmlFor?: string;
  className?: string;
}

/** 52 px form row with a label and a trailing control (the "Menge" row holds a compact stepper). */
export function FormRow({ label, children, htmlFor, className }: FormRowProps) {
  const labelId = useId();
  return (
    <div className={cx('homi-form-row', className)} role="group" aria-labelledby={labelId}>
      {htmlFor ? (
        <label id={labelId} htmlFor={htmlFor} className="homi-form-row__label">
          {label}
        </label>
      ) : (
        <span id={labelId} className="homi-form-row__label">
          {label}
        </span>
      )}
      <div className="homi-form-row__control">{children}</div>
    </div>
  );
}
