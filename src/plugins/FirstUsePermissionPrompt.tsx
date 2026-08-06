/**
 * First-use permission prompt (I7.2).
 *
 * Renders when a plugin requests a permission at runtime that the
 * user hasn't yet decided on — typically an **optional** permission
 * the user skipped at install time (I7.1) and the plugin now needs
 * to satisfy a feature request.
 *
 * Three choices map to the I0 grant store:
 *
 *   - **Allow once** — host satisfies the in-flight request without
 *     persisting any grant. Next time the plugin asks for the same
 *     permission, the prompt fires again.
 *   - **Allow always** — host persists the grant. Future requests for
 *     the same permission skip the prompt.
 *   - **Deny** — host refuses the in-flight request. No persisted
 *     deny today; future requests re-prompt. (A "Deny always" choice
 *     can land in M2 — the I7.2 spec is three buttons; adding a
 *     fourth would change the cognitive shape of the prompt.)
 *
 * Distinct from {@link PluginInstallDialog} (I7.1), which is the bulk
 * consent gate at install time. This component is the **per-call**
 * runtime gate.
 */

import { useEffect, useId } from 'react';
import { Shield, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';

/** What the host needs from the UI when surfacing the prompt. The
 *  shell builds this from the plugin's permission-request callback. */
export interface FirstUsePermissionRequest {
  /** Plugin id (`org.example.fmt`) — used for log enrichment + the
   *  audit trail attached to the user's choice. */
  pluginId: string;
  /** Display name from the manifest (`"Format SQL"`). */
  pluginName: string;
  /** The permission string the plugin is asking for (`network.fetch`,
   *  `fs.read:/Users/zlatan/Documents/**`, etc.). Rendered in mono
   *  so the user can read the literal grant. */
  permission: string;
  /** Optional one-sentence reason the plugin supplied when calling
   *  the request API. The host MAY surface this to give context;
   *  malicious plugins can lie here so the user should still gate on
   *  the permission string itself. `null` / undefined hides the
   *  block. */
  reason?: string | null;
}

export interface FirstUsePermissionPromptProps {
  /** Active request to display. `null` hides the prompt. The shell
   *  toggles this on/off as the queue of pending requests advances. */
  request: FirstUsePermissionRequest | null;
  /** Fires when the user clicks **Allow once**. Host satisfies the
   *  call WITHOUT persisting the grant. */
  onAllowOnce: () => void;
  /** Fires when the user clicks **Allow always**. Host satisfies the
   *  call AND persists the grant via `plugin_grant_permission`. */
  onAllowAlways: () => void;
  /** Fires when the user clicks **Deny** (or Esc / X). Host refuses
   *  the call. */
  onDeny: () => void;
}

export function FirstUsePermissionPrompt({
  request,
  onAllowOnce,
  onAllowAlways,
  onDeny,
}: FirstUsePermissionPromptProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDeny();
      }
      // Enter intentionally has no default action — the choice is
      // three-way and we don't want the safest default (deny) to
      // accidentally fire from an idle Enter press.
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [request, onDeny]);

  if (!request) return null;

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
          <ShieldQuestion
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
            aria-hidden
          />
          <div className="flex-1">
            <h2
              id={titleId}
              className="text-[13px] font-semibold text-fg"
            >
              Permission request
            </h2>
            <p
              id={descId}
              className="mt-0.5 text-[11px] text-fg-muted"
            >
              <span className="font-medium text-fg">
                {request.pluginName}
              </span>{' '}
              wants to use a permission it does not yet have.
            </p>
          </div>
        </header>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-md border border-edge bg-canvas p-2 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <Shield
                className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
                aria-hidden
              />
              <span className="text-fg">{request.permission}</span>
            </div>
          </div>

          {request.reason !== undefined && request.reason !== null && (
            <div className="rounded-md border border-edge bg-canvas p-3 text-[11px]">
              <div className="mb-1 text-fg-subtle">
                Plugin-supplied reason
              </div>
              <p className="text-fg-muted">{request.reason}</p>
              <p className="mt-1 text-[10px] italic text-fg-subtle">
                Plugins author this string. Gate on the permission
                above, not on the reason.
              </p>
            </div>
          )}

          <p className="text-[11px] text-fg-muted">
            Choose how long the grant lasts. Cancelling denies this
            request; future requests will re-prompt.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-canvas/40 px-4 py-3">
          <button
            type="button"
            onClick={onDeny}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-[12px] text-fg hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-edge"
          >
            <ShieldX className="h-3.5 w-3.5" aria-hidden />
            Deny
          </button>
          <button
            type="button"
            onClick={onAllowOnce}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-200 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <Shield className="h-3.5 w-3.5" aria-hidden />
            Allow once
          </button>
          <button
            type="button"
            onClick={onAllowAlways}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Allow always
          </button>
        </footer>
      </div>
    </div>
  );
}
