/**
 * URL input modal for the install-from-URL flow (I7.6).
 *
 * Acts as the `pick` adapter for {@link usePluginInstallFlow} when
 * the source is a remote `.plx` URL. Pure component — the host wires
 * the resulting URL into the install flow's `validate` + `install`
 * adapters (which do the actual network fetch + persist).
 *
 * # UX
 *
 * - Single URL input (HTTPS scheme required by the validator regex
 *   so users can't accidentally submit `file://` or `javascript:`).
 * - Fetch button disabled until the input parses as a valid URL.
 * - Esc cancels. Enter submits when the input is valid.
 * - Optional `error` prop renders an inline message below the input
 *   (host sets it from the install-flow's `error` state so a failed
 *   download surfaces here without spawning a separate toast).
 */

import { useEffect, useId, useState } from 'react';
import { Download, Globe, X } from 'lucide-react';

export interface PluginInstallFromUrlDialogProps {
  /** When `true`, the dialog renders. The host toggles this when the
   *  user clicks "Install from URL…". */
  open: boolean;
  /** Pre-fills the URL input (e.g. when the host resumes a failed
   *  attempt). Omit for an empty field. */
  initialUrl?: string;
  /** Disables submission while the host is fetching / validating /
   *  installing. Typically wired to the install-flow's `isBusy`
   *  accessor. */
  busy?: boolean;
  /** Inline error from the most recent attempt. Rendered below the
   *  input. `null` hides the row. */
  error?: string | null;
  /** Fires when the user submits a valid URL. The host then runs
   *  the install-flow's `start()` with a `pick` adapter that returns
   *  this URL. */
  onSubmit: (url: string) => void;
  /** Fires from Esc / Cancel button / X icon. */
  onCancel: () => void;
}

/** Basic URL syntax + scheme check. The host's validator does the
 *  real fetch + manifest parse; this is a defensive gate against
 *  obviously-bad input. Limits to http/https — `.plx` bundles are
 *  always served over HTTP today; `file://` would bypass any
 *  signature checks that arrive in I7.16. */
export function isValidPluginUrl(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PluginInstallFromUrlDialog({
  open,
  initialUrl,
  busy = false,
  error = null,
  onSubmit,
  onCancel,
}: PluginInstallFromUrlDialogProps) {
  const titleId = useId();
  const errorId = useId();
  const inputId = useId();
  const [url, setUrl] = useState(initialUrl ?? '');

  // Reset input when the dialog reopens with a different initial.
  useEffect(() => {
    if (open) setUrl(initialUrl ?? '');
  }, [open, initialUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const valid = isValidPluginUrl(url);
  const submit = () => {
    if (!valid || busy) return;
    onSubmit(url.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-fg-subtle" aria-hidden />
            <h2 id={titleId} className="text-[13px] font-semibold text-fg">
              Install plugin from URL
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
            aria-label="Cancel install"
            disabled={busy}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor={inputId} className="block text-[11px] text-fg-muted">
            URL to a <code className="font-mono">.plx</code> archive
            (HTTP or HTTPS).
          </label>
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            placeholder="https://example.com/plugin.plx"
            className="w-full rounded-md border border-edge bg-canvas px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-300/30 disabled:opacity-60"
            aria-invalid={error !== null}
            aria-describedby={error !== null ? errorId : undefined}
          />
          {error !== null && (
            <p
              id={errorId}
              role="alert"
              className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200"
            >
              {error}
            </p>
          )}
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-canvas/40 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-edge px-4 py-1.5 text-[12px] text-fg hover:bg-bg-subtle disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {busy ? 'Fetching…' : 'Fetch + validate'}
          </button>
        </footer>
      </div>
    </div>
  );
}
