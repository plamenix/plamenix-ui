/**
 * Plugin install dialog (I7.1).
 *
 * Shown after the user picks a `.plx` bundle (or fetches one from a
 * URL) and the host has validated the manifest. The dialog summarises
 * the plugin's identity + the permissions it asks for, gates the
 * install behind explicit user consent, and hands back the set of
 * **optional** permissions the user chose to grant.
 *
 * Two permission groups follow the I0/I3 contract:
 *
 *   - **Required permissions** are batched. The user either accepts
 *     the entire batch (clicking the confirm button) or cancels the
 *     install. Individual required permissions cannot be opted out
 *     of — the plugin manifest declares them as load-bearing.
 *   - **Optional permissions** sit behind a collapsed disclosure
 *     ("Show optional permissions"). The user expands the group, sees
 *     a checkbox per permission, and toggles only the ones they want
 *     to grant. The confirm button submits the chosen subset to the
 *     host's `plugin_install` command.
 *
 * Keyboard:
 *   - `Esc` cancels.
 *   - `Enter` confirms (suppressed when an input/textarea is focused
 *     so users typing in the disclosure-opened checklist don't fire
 *     the install by mistake).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react';

/** Minimal metadata the dialog needs to display + commit an install.
 *  Comes from the validated manifest the host parsed off the bundle.
 *  Mirrors the relevant subset of `plamenix-plugin-host::Manifest`. */
export interface PendingPluginInstall {
  /** Plugin identifier from the manifest (`org.example.fmt`). */
  id: string;
  /** Display name. */
  name: string;
  /** SemVer string. */
  version: string;
  /** Optional one-line description (rendered under the name). */
  description?: string | null;
  /** Optional publisher / vendor string. Plugins may omit. */
  publisher?: string | null;
  /** Permissions the plugin manifest marks as required (must be
   *  granted for the plugin to load). */
  requiredPermissions: string[];
  /** Permissions the plugin manifest marks as optional. The user
   *  picks the subset they want to grant. */
  optionalPermissions: string[];
  /** I7.16 — outcome of the host-side `verify_archive` call. The
   *  install dialog renders an inline banner colour-coded by state:
   *  emerald for verified, red for unsigned, amber for invalid.
   *  Omit to render no signature row (legacy hosts that haven't yet
   *  surfaced verification data). */
  signature?: PluginSignatureState;
}

/** Outcome of the host's signature verification step (I7.16). Mirrors
 *  the `plamenix-plugin-host::VerificationOutcome` shape + the two
 *  refusal cases the host returns (`SignatureMissing` /
 *  `SignatureInvalid`). */
export type PluginSignatureState =
  | { status: 'verified'; publicKeyHex: string; keyId?: string; signedAt?: string }
  | { status: 'unsigned' }
  | { status: 'invalid'; reason: string };

export interface PluginInstallDialogProps {
  /** Plugin descriptor to install. `null` hides the dialog (use this
   *  as the open/close gate from the parent). */
  pending: PendingPluginInstall | null;
  /** Fires when the user confirms. `grantedOptional` is the subset of
   *  `pending.optionalPermissions` the user chose to grant. The host
   *  is expected to persist required + chosen optional and call its
   *  install API. */
  onConfirm: (
    pluginId: string,
    grantedOptional: string[],
  ) => void;
  /** Fires when the user cancels (Esc / cancel button / backdrop). */
  onCancel: () => void;
}

export function PluginInstallDialog({
  pending,
  onConfirm,
  onCancel,
}: PluginInstallDialogProps) {
  const titleId = useId();
  const descId = useId();
  const [optionalGranted, setOptionalGranted] = useState<Set<string>>(
    () => new Set(),
  );
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  // Reset selection + collapse state every time the dialog opens for
  // a fresh plugin. Avoids carrying over toggles from a prior install.
  useEffect(() => {
    setOptionalGranted(new Set());
    setOptionalExpanded(false);
  }, [pending?.id]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'BUTTON')
        ) {
          return;
        }
        e.preventDefault();
        onConfirm(pending.id, Array.from(optionalGranted));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onCancel, onConfirm, optionalGranted]);

  const required = useMemo(
    () => pending?.requiredPermissions ?? [],
    [pending?.requiredPermissions],
  );
  const optional = useMemo(
    () => pending?.optionalPermissions ?? [],
    [pending?.optionalPermissions],
  );

  if (!pending) return null;

  const toggleOptional = (permission: string) => {
    setOptionalGranted((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return next;
    });
  };

  const confirm = () => {
    onConfirm(pending.id, Array.from(optionalGranted));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-fg-subtle" aria-hidden />
            <h2 id={titleId} className="text-[13px] font-semibold text-fg">
              Install plugin
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
            aria-label="Cancel install"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <section>
            <h3 className="text-[13px] font-semibold text-fg">
              {pending.name}
              <span className="ml-2 font-mono text-[11px] font-normal text-fg-subtle">
                v{pending.version}
              </span>
            </h3>
            <p
              id={descId}
              className="mt-1 text-[12px] text-fg-muted"
            >
              {pending.description ?? (
                <span className="italic text-fg-subtle">No description provided.</span>
              )}
            </p>
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-fg-subtle">Plugin id</dt>
              <dd className="font-mono text-fg-muted">{pending.id}</dd>
              {pending.publisher !== undefined && pending.publisher !== null && (
                <>
                  <dt className="text-fg-subtle">Publisher</dt>
                  <dd className="text-fg-muted">{pending.publisher}</dd>
                </>
              )}
            </dl>
          </section>

          {pending.signature && (
            <SignatureBanner signature={pending.signature} />
          )}

          {required.length > 0 ? (
            <section
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
              aria-labelledby={`${titleId}-required-heading`}
            >
              <div className="mb-2 flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                  aria-hidden
                />
                <div>
                  <h4
                    id={`${titleId}-required-heading`}
                    className="text-[12px] font-medium text-fg"
                  >
                    Required permissions
                  </h4>
                  <p className="mt-0.5 text-[11px] text-fg-muted">
                    Installing this plugin grants every permission in
                    this batch. Cancel to refuse.
                  </p>
                </div>
              </div>
              <ul className="space-y-1">
                {required.map((permission) => (
                  <li
                    key={permission}
                    className="flex items-center gap-2 rounded bg-bg-canvas/40 px-2 py-1 font-mono text-[11px] text-fg"
                  >
                    <Shield className="h-3 w-3 shrink-0 text-amber-400" aria-hidden />
                    {permission}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-lg border border-edge bg-canvas p-3 text-[11px] text-fg-muted">
              This plugin does not declare any required permissions.
            </section>
          )}

          {optional.length > 0 && (
            <section className="rounded-lg border border-edge bg-canvas">
              <button
                type="button"
                onClick={() => setOptionalExpanded((v) => !v)}
                aria-expanded={optionalExpanded}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium text-fg hover:bg-bg-subtle"
              >
                <span className="flex items-center gap-2">
                  {optionalExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                  )}
                  Optional permissions
                </span>
                <span className="text-[11px] font-normal text-fg-subtle">
                  {optionalGranted.size}/{optional.length} selected
                </span>
              </button>
              {optionalExpanded && (
                <ul className="border-t border-edge">
                  {optional.map((permission) => {
                    const granted = optionalGranted.has(permission);
                    return (
                      <li key={permission}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-bg-subtle">
                          <input
                            type="checkbox"
                            checked={granted}
                            onChange={() => toggleOptional(permission)}
                            className="h-3 w-3 accent-emerald-500"
                          />
                          <Shield className="h-3 w-3 text-fg-subtle" aria-hidden />
                          <span className="font-mono text-fg">{permission}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-canvas/40 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-edge px-4 py-1.5 text-[12px] text-fg hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-edge"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Install
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Renders the signature-state banner (I7.16). Exported so other
 *  surfaces (e.g. the Permissions panel, a future audit log) can
 *  show the same visual language. */
export function SignatureBanner({
  signature,
}: {
  signature: PluginSignatureState;
}) {
  if (signature.status === 'verified') {
    return (
      <section
        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3"
        aria-label="Signature verified"
      >
        <div className="flex items-start gap-2">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1 text-[11px] text-fg-muted">
            <div className="font-medium text-fg">Signature verified</div>
            <div className="mt-0.5 truncate font-mono text-[10px]">
              key: {signature.publicKeyHex}
            </div>
            {signature.keyId && (
              <div className="text-[10px] text-fg-subtle">id: {signature.keyId}</div>
            )}
          </div>
        </div>
      </section>
    );
  }
  if (signature.status === 'invalid') {
    return (
      <section
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
        aria-label="Signature invalid"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1 text-[11px] text-fg-muted">
            <div className="font-medium text-fg">Signature invalid</div>
            <p className="mt-0.5">
              The archive carries a signature that did not verify.
              Installing is unsafe — the bundle may have been
              tampered with after signing.
            </p>
            <p className="mt-1 text-[10px] text-fg-subtle">{signature.reason}</p>
          </div>
        </div>
      </section>
    );
  }
  // status === 'unsigned'
  return (
    <section
      className="rounded-lg border border-red-500/40 bg-red-500/10 p-3"
      aria-label="Plugin is unsigned"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <ShieldX
          className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
          aria-hidden
        />
        <div className="text-[11px] text-fg-muted">
          <div className="font-medium text-fg">Unsigned plugin</div>
          <p className="mt-0.5">
            This archive has no signature. The host cannot verify who
            built it. Install only if you trust the source.
          </p>
        </div>
      </div>
    </section>
  );
}
