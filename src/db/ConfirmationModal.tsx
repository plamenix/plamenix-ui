/**
 * Generic confirmation modal (subtask E, 2026-06-01).
 *
 * The shell mounts a single `<ConfirmationModal>` at the App root +
 * registers a `ConfirmationProvider` (via I6.12's
 * `setConfirmationProvider`) that pushes a `ConfirmationRequest`
 * into a queue and returns a promise. The modal renders the head of
 * the queue; user clicking confirm/cancel resolves the matching
 * promise + advances the queue.
 *
 * Two severity treatments:
 *   - `'danger'` — destructive ops. Red confirm button. Used by the
 *     I6.12 built-in destructive-DROP interceptor.
 *   - `'warn'` — non-destructive but noteworthy ops. Amber confirm
 *     button. Reserved for future built-ins (e.g. "this query is
 *     estimated to scan 50M rows — proceed?").
 *
 * Keyboard:
 *   - `Esc` → cancel
 *   - `Enter` → confirm (when no input focused — modal has no inputs)
 *
 * Queue semantics: multiple interceptor chains can race confirmations
 * (e.g. user runs two destructive queries in quick succession). The
 * queue keeps them ordered; each user action resolves exactly one
 * request.
 */

import { useEffect, useId } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

export interface ConfirmationModalProps {
  /** Head of the queue. `null` hides the modal. */
  request: PendingConfirmation | null;
  /** Resolves the head's promise with `true`. */
  onConfirm: () => void;
  /** Resolves the head's promise with `false`. */
  onCancel: () => void;
}

/** A confirmation request enriched with the shell-side promise
 *  resolver. The shell-registered provider wraps the bare
 *  `ConfirmationRequest` (from `@plamenix/ui` I6.12) into this shape
 *  for the modal's consumption. */
export interface PendingConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  severity: 'danger' | 'warn';
}

export function ConfirmationModal({
  request,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [request, onConfirm, onCancel]);

  if (!request) return null;

  const isDanger = request.severity === 'danger';
  const Icon = isDanger ? ShieldAlert : AlertTriangle;
  const iconClass = isDanger ? 'text-red-500' : 'text-amber-500';
  const confirmClass = isDanger
    ? 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-300'
    : 'bg-amber-500 text-white hover:bg-amber-400 focus:ring-amber-300';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-md rounded-lg border border-edge bg-panel p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${iconClass}`} aria-hidden />
          <div className="flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {request.title}
            </h2>
            <p id={descId} className="mt-1 text-sm text-fg-muted">
              {request.message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-edge px-4 py-2 text-sm text-fg hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-edge"
          >
            {request.cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 ${confirmClass}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
