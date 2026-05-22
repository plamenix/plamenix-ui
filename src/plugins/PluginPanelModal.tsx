import { useEffect } from 'react';
import {
  AlertCircle,
  Check,
  Plug,
  Shield,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import type { ActivePlugin, SidebarPanelInfo } from './types';

export interface PluginPanelModalProps {
  plugin: ActivePlugin | null;
  panel: SidebarPanelInfo | null;
  onClose: () => void;
  /** Fires when the user grants a permission. Host calls
   *  `plugin_grant_permission` then refreshes the plugin list. */
  onGrant?: (pluginId: string, permission: string) => void;
  /** Fires when the user revokes a previously granted permission. */
  onRevoke?: (pluginId: string, permission: string) => void;
}

const LEVEL_CLASS: Record<string, string> = {
  trace: 'text-fg-subtle',
  debug: 'text-fg-subtle',
  info: 'text-fg-muted',
  warn: 'text-warning',
  error: 'text-danger',
};

/**
 * Demo viewer for a clicked plugin contribution. Until plugins ship
 * their own React UI half, the host renders this scaffold: plugin
 * metadata + captured activation log lines. Closes on Esc / backdrop /
 * X.
 */
export function PluginPanelModal({
  plugin,
  panel,
  onClose,
  onGrant,
  onRevoke,
}: PluginPanelModalProps) {
  useEffect(() => {
    if (!plugin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [plugin, onClose]);

  if (!plugin || !panel) return null;
  return (
    <div
      role="dialog"
      aria-label={panel.label}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[10vh] flex max-h-[80vh] w-[min(40rem,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-4 py-2.5">
          <Plug className="h-4 w-4 text-accent" />
          <h2 className="text-[13px] font-semibold text-fg">{panel.label}</h2>
          <span className="font-mono text-[10px] text-fg-subtle">·</span>
          <span className="truncate font-mono text-[11px] text-fg-muted" title={plugin.id}>
            {plugin.id} v{plugin.version}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-4">
          {plugin.description && (
            <p className="text-xs text-fg-muted">{plugin.description}</p>
          )}

          {plugin.activation.status === 'failed' && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{plugin.activation.message}</span>
            </div>
          )}

          <section>
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              <Terminal className="h-3 w-3" />
              Activation log
              <span className="ml-1 font-mono text-fg-subtle">
                ({plugin.logs.length})
              </span>
            </div>
            {plugin.logs.length === 0 ? (
              <p className="rounded bg-inset px-3 py-3 text-xs italic text-fg-subtle">
                Plugin emitted no log lines during activation.
              </p>
            ) : (
              <ul className="space-y-1 rounded bg-inset p-2">
                {plugin.logs.map((entry, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 font-mono text-[11px] ${LEVEL_CLASS[entry.level] ?? 'text-fg-muted'}`}
                  >
                    <span className="shrink-0 uppercase opacity-60">{entry.level}</span>
                    <span className="break-words">{entry.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <PermissionsSection plugin={plugin} onGrant={onGrant} onRevoke={onRevoke} />

          <section className="rounded border border-edge bg-canvas p-3 text-[11px] text-fg-subtle">
            This is the v0 host-rendered plugin scaffold. Plugins will ship their own React UI
            modules in a later revision; the host will import them and mount them in this slot.
          </section>
        </div>
      </div>
    </div>
  );
}

function PermissionsSection({
  plugin,
  onGrant,
  onRevoke,
}: {
  plugin: ActivePlugin;
  onGrant: ((pluginId: string, permission: string) => void) | undefined;
  onRevoke: ((pluginId: string, permission: string) => void) | undefined;
}) {
  const total = plugin.requiredPermissions.length + plugin.optionalPermissions.length;
  if (total === 0) {
    return (
      <section>
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          <Shield className="h-3 w-3" />
          Permissions
        </div>
        <p className="rounded bg-inset px-3 py-3 text-xs italic text-fg-subtle">
          Plugin declares no permissions.
        </p>
      </section>
    );
  }

  const granted = new Set(plugin.grantedPermissions);

  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        <Shield className="h-3 w-3" />
        Permissions
        {plugin.pendingPermissions.length > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-px text-[10px] text-warning">
            <ShieldAlert className="h-3 w-3" />
            {plugin.pendingPermissions.length} pending
          </span>
        )}
      </div>
      <div className="space-y-3">
        {plugin.requiredPermissions.length > 0 && (
          <PermissionList
            title="Required"
            permissions={plugin.requiredPermissions}
            granted={granted}
            pluginId={plugin.id}
            required
            onGrant={onGrant}
            onRevoke={onRevoke}
          />
        )}
        {plugin.optionalPermissions.length > 0 && (
          <PermissionList
            title="Optional"
            permissions={plugin.optionalPermissions}
            granted={granted}
            pluginId={plugin.id}
            required={false}
            onGrant={onGrant}
            onRevoke={onRevoke}
          />
        )}
      </div>
    </section>
  );
}

function PermissionList({
  title,
  permissions,
  granted,
  pluginId,
  required,
  onGrant,
  onRevoke,
}: {
  title: string;
  permissions: string[];
  granted: Set<string>;
  pluginId: string;
  required: boolean;
  onGrant: ((pluginId: string, permission: string) => void) | undefined;
  onRevoke: ((pluginId: string, permission: string) => void) | undefined;
}) {
  return (
    <div className="rounded-lg border border-edge bg-inset">
      <div className="border-b border-edge px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {title}
      </div>
      <ul>
        {permissions.map((p) => {
          const isGranted = granted.has(p);
          const pending = required && !isGranted;
          return (
            <li
              key={p}
              className="flex items-center gap-2 border-b border-edge-subtle px-3 py-1.5 last:border-b-0"
            >
              {isGranted ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-success" />
              ) : pending ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
              ) : (
                <Shield className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              )}
              <code className="flex-1 truncate font-mono text-[11px] text-fg" title={p}>
                {p}
              </code>
              {isGranted ? (
                <button
                  type="button"
                  onClick={() => onRevoke?.(pluginId, p)}
                  disabled={!onRevoke}
                  className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                >
                  Revoke
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onGrant?.(pluginId, p)}
                  disabled={!onGrant}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors disabled:opacity-50 ${
                    pending
                      ? 'bg-warning-subtle text-warning hover:bg-warning hover:text-fg-inverted'
                      : 'text-fg-muted hover:bg-accent-subtle hover:text-accent'
                  }`}
                >
                  Grant
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
