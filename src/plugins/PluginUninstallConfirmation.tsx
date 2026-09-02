/**
 * Plugin uninstall confirmation modal (I7.7).
 *
 * Three things go away when a plugin is uninstalled:
 *
 *   1. **Plugin directory** — the extracted bundle under
 *      `PLUGINS_DIR/<plugin_id>/`. Always deleted; the only way to
 *      preserve it would be to keep the plugin installed.
 *   2. **Permission grants** — every persisted entry in the grant
 *      store keyed by this plugin id. Always cleared.
 *   3. **Plugin storage** — the plugin's KV-store data under
 *      `PLUGINS_DATA_DIR/<plugin_id>/`. Optional. Users may want to
 *      preserve it across re-installs (e.g. a SQL formatter's
 *      learned style preferences). The default is to delete (full
 *      cleanup) but an unchecked checkbox keeps it.
 *
 * The component is pure — host provides the per-plugin info via
 * `pending` and consumes the `onConfirm(alsoDeleteStorage)` payload.
 * Host wires this to a Tauri `plugin_uninstall` command that
 * performs the three deletions in order.
 */

import { useEffect, useId, useState } from 'react';
import { AlertOctagon, Trash2, X } from 'lucide-react';

/** What the modal needs to display + return on confirm. The host
 *  builds this from the active plugin + grant counts + an optional
 *  preflight storage-size query. */
export interface PendingPluginUninstall {
  id: string;
  name: string;
  version: string;
  /** Number of granted permissions that will be cleared. */
  grantCount: number;
  /** Optional storage size on disk in bytes. `null` / undefined hides
   *  the storage row (the host did not surface the data, or there is
   *  no storage to begin with). */
  storageBytes?: number | null;
}

export interface PluginUninstallConfirmationProps {
  /** Plugin to uninstall. `null` hides the dialog. */
  pending: PendingPluginUninstall | null;
  /** Fires when the user confirms. `alsoDeleteStorage` is the
   *  user's choice for the optional storage-deletion checkbox. */
  onConfirm: (alsoDeleteStorage: boolean) => void;
  /** Fires from Esc / Cancel button / X icon. */
  onCancel: () => void;
  /** Disables actions while the host is running the uninstall. */
  busy?: boolean;
  /** Inline error rendered above the action buttons (e.g. when a
   *  prior attempt failed). `null` hides the row. */
  error?: string | null;
}

/** Formats a byte count as a short human string. KB / MB / GB use
 *  the IEC 1024 base because file managers (Finder, Explorer)
 *  largely do too in this size bracket. */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  const gib = mib / 1024;
  return `${gib.toFixed(2)} GiB`;
}

export function PluginUninstallConfirmation({
  pending,
  onConfirm,
  onCancel,
  busy = false,
  error = null,
}: PluginUninstallConfirmationProps) {
  const titleId = useId();
  const descId = useId();
  const errorId = useId();
  const [deleteStorage, setDeleteStorage] = useState(true);

  // Reset checkbox when the dialog re-opens for a different plugin.
  useEffect(() => {
    if (pending) setDeleteStorage(true);
  }, [pending?.id]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onCancel, busy]);

  if (!pending) return null;

  const submit = () => {
    if (busy) return;
    onConfirm(deleteStorage);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
        <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
          <AlertOctagon
            className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
            aria-hidden
          />
          <div className="flex-1">
            <h2 id={titleId} className="text-[13px] font-semibold text-fg">
              Uninstall plugin
            </h2>
            <p id={descId} className="mt-0.5 text-[11px] text-fg-muted">
              <span className="font-medium text-fg">{pending.name}</span>{' '}
              <span className="font-mono text-fg-subtle">
                v{pending.version}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg disabled:opacity-60"
            aria-label="Cancel uninstall"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <section
            className="rounded-lg border border-red-500/40 bg-red-500/10 p-3"
            aria-labelledby={`${titleId}-actions`}
          >
            <h3
              id={`${titleId}-actions`}
              className="text-[12px] font-medium text-fg"
            >
              Uninstall will:
            </h3>
            <ul className="mt-2 space-y-1 text-[11px] text-fg-muted">
              <li className="flex items-start gap-2">
                <Trash2
                  className="mt-0.5 h-3 w-3 shrink-0 text-red-300"
                  aria-hidden
                />
                Delete the extracted bundle and on-disk files.
              </li>
              <li className="flex items-start gap-2">
                <Trash2
                  className="mt-0.5 h-3 w-3 shrink-0 text-red-300"
                  aria-hidden
                />
                Clear {pending.grantCount} permission grant
                {pending.grantCount === 1 ? '' : 's'} for this plugin.
              </li>
              {pending.storageBytes !== undefined &&
                pending.storageBytes !== null &&
                pending.storageBytes > 0 && (
                  <li className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={deleteStorage}
                      onChange={(e) => setDeleteStorage(e.target.checked)}
                      disabled={busy}
                      aria-label="Also delete plugin storage"
                      className="mt-0.5 h-3 w-3 accent-red-500"
                    />
                    <span>
                      Also delete plugin storage (
                      {formatStorageSize(pending.storageBytes)}). Uncheck to
                      preserve plugin data for a future re-install.
                    </span>
                  </li>
                )}
            </ul>
          </section>

          <p className="text-[11px] text-fg-subtle">
            Plugin id <span className="font-mono">{pending.id}</span>. This
            cannot be undone.
          </p>

          {error !== null && (
            <p
              id={errorId}
              role="alert"
              className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200"
            >
              {error}
            </p>
          )}
        </div>

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
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {busy ? 'Uninstalling…' : 'Uninstall'}
          </button>
        </footer>
      </div>
    </div>
  );
}
