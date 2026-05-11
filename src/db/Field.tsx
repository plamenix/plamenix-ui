import type { ReactNode } from 'react';

export interface FieldProps {
  /** Visible label above the input. */
  label: string;
  /** Extra Tailwind classes appended to the wrapping `<label>`. */
  className?: string;
  /** Form control (typically a styled `<input>` or `<select>`). */
  children: ReactNode;
}

/** A labelled wrapper around a form control. */
export function Field({ label, className, children }: FieldProps) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-400 ${className ?? ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
