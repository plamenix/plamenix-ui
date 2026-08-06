/**
 * Permissions panel — process-wide per-plugin × capability view (I7.3).
 *
 * Distinct from {@link PluginPanelModal}, which surfaces a single
 * plugin's permissions in the side-panel modal context. The
 * Permissions panel renders the FULL landscape: one row per
 * `(plugin, permission)` pair so the user can audit grants across
 * every installed plugin in a single screen and revoke optional
 * grants without diving into each plugin individually.
 *
 * # Per-row semantics
 *
 * Each row carries:
 *   - **Plugin** — name + monospaced id.
 *   - **Permission** — monospaced grant string.
 *   - **Kind** — `Required` or `Optional` (manifest classification).
 *   - **Status** — `Granted`, `Pending` (required + not yet granted),
 *     or `Revoked` (optional + not granted).
 *   - **Action** — a button:
 *       - `Required` + `Granted` → no action (revoke would break the
 *         plugin; the user uninstalls instead).
 *       - `Required` + `Pending` → `Grant` button.
 *       - `Optional` + `Granted` → `Revoke` button.
 *       - `Optional` + `Revoked` → `Grant` button.
 *
 * # Filter
 *
 * The text input filters rows by plugin name, plugin id, or
 * permission string (case-insensitive substring match). Empty filter
 * shows every row.
 *
 * # A11y
 *
 * Renders a semantic `<table>` with `<thead>` / `<tbody>` /
 * `<th scope="col">`. Per-row action buttons carry visible text +
 * aria-labels that include the plugin id + permission so screen
 * readers announce the full target of the action.
 */

import { useMemo, useState } from 'react';
import {
  Activity,
  Filter,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import type { ActivePlugin } from './types';
import {
  DISABLE_REASON_LABEL,
  STATUS_LABEL,
  STATUS_PILL_CLASS,
  crashBudgetBarClass,
  crashBudgetPercent,
} from './supervision-labels';

export interface PermissionsPanelProps {
  /** Installed plugins to display. The panel renders one row per
   *  `(plugin, permission)` pair drawn from `requiredPermissions ∪
   *  optionalPermissions`. */
  plugins: ActivePlugin[];
  /** Fires when the user grants a previously-revoked optional or
   *  pending-required permission. */
  onGrant?: (pluginId: string, permission: string) => void;
  /** Fires when the user revokes a previously-granted OPTIONAL
   *  permission. Required-granted permissions are not revocable from
   *  this panel — the user uninstalls instead. */
  onRevoke?: (pluginId: string, permission: string) => void;
  /** Fires when the user clicks "Re-enable" on a `disabled` plugin
   *  in the supervision section. The host calls the supervisor's
   *  re-enable API (resets crash budget + restart counter +
   *  transitions status to `Loaded` so the next activation can
   *  succeed). Omit to hide the button (read-only context). */
  onReEnable?: (pluginId: string) => void;
}

interface MatrixRow {
  plugin: ActivePlugin;
  permission: string;
  kind: 'required' | 'optional';
  granted: boolean;
}

function buildRows(plugins: ActivePlugin[]): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const plugin of plugins) {
    const grantedSet = new Set(plugin.grantedPermissions);
    for (const permission of plugin.requiredPermissions) {
      rows.push({
        plugin,
        permission,
        kind: 'required',
        granted: grantedSet.has(permission),
      });
    }
    for (const permission of plugin.optionalPermissions) {
      rows.push({
        plugin,
        permission,
        kind: 'optional',
        granted: grantedSet.has(permission),
      });
    }
  }
  return rows;
}

function applyFilter(rows: MatrixRow[], filter: string): MatrixRow[] {
  const q = filter.trim().toLowerCase();
  if (q === '') return rows;
  return rows.filter((row) => {
    return (
      row.plugin.name.toLowerCase().includes(q) ||
      row.plugin.id.toLowerCase().includes(q) ||
      row.permission.toLowerCase().includes(q)
    );
  });
}

export function PermissionsPanel({
  plugins,
  onGrant,
  onRevoke,
  onReEnable,
}: PermissionsPanelProps) {
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => buildRows(plugins), [plugins]);
  const visible = useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const supervised = useMemo(
    () => plugins.filter((p) => p.supervision !== undefined),
    [plugins],
  );

  return (
    <div className="flex h-full flex-col">
      {supervised.length > 0 && (
        <SupervisionMatrix plugins={supervised} onReEnable={onReEnable} />
      )}
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">Permissions</h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Audit and revoke optional grants across every installed plugin.
            Required grants are uninstall-only.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-edge bg-canvas px-2 py-1">
          <Filter className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by plugin or permission…"
            className="w-56 bg-transparent text-[11px] text-fg outline-none placeholder:text-fg-subtle"
            aria-label="Filter permissions"
          />
        </label>
      </header>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState
            title="No plugins installed"
            message="Permissions appear here once a plugin is installed."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No matches"
            message={`Nothing matches "${filter.trim()}".`}
          />
        ) : (
          <table className="min-w-full text-[12px]">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-edge text-left text-[10px] uppercase tracking-wide text-fg-subtle">
                <th scope="col" className="px-4 py-2 font-medium">
                  Plugin
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Permission
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Kind
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <PermissionRow
                  key={`${row.plugin.id}::${row.kind}::${row.permission}`}
                  row={row}
                  onGrant={onGrant}
                  onRevoke={onRevoke}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PermissionRow({
  row,
  onGrant,
  onRevoke,
}: {
  row: MatrixRow;
  onGrant: ((pluginId: string, permission: string) => void) | undefined;
  onRevoke: ((pluginId: string, permission: string) => void) | undefined;
}) {
  const { plugin, permission, kind, granted } = row;
  const status = ((): { label: string; tone: 'granted' | 'pending' | 'revoked' } => {
    if (granted) return { label: 'Granted', tone: 'granted' };
    if (kind === 'required') return { label: 'Pending', tone: 'pending' };
    return { label: 'Revoked', tone: 'revoked' };
  })();
  const statusClass =
    status.tone === 'granted'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status.tone === 'pending'
        ? 'bg-red-500/15 text-red-300'
        : 'bg-bg-subtle text-fg-muted';
  const kindClass =
    kind === 'required'
      ? 'bg-amber-500/15 text-amber-300'
      : 'bg-sky-500/15 text-sky-300';

  return (
    <tr className="border-b border-edge/60 hover:bg-bg-subtle/40">
      <td className="px-4 py-2 align-top">
        <div className="text-fg">{plugin.name}</div>
        <div className="font-mono text-[10px] text-fg-subtle">{plugin.id}</div>
      </td>
      <td className="px-4 py-2 align-top font-mono text-[11px] text-fg">
        {permission}
      </td>
      <td className="px-4 py-2 align-top">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${kindClass}`}
        >
          <Shield className="h-3 w-3" aria-hidden />
          {kind}
        </span>
      </td>
      <td className="px-4 py-2 align-top">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClass}`}
        >
          {status.tone === 'granted' && <ShieldCheck className="h-3 w-3" aria-hidden />}
          {status.tone === 'pending' && <ShieldAlert className="h-3 w-3" aria-hidden />}
          {status.tone === 'revoked' && <ShieldX className="h-3 w-3" aria-hidden />}
          {status.label}
        </span>
      </td>
      <td className="px-4 py-2 align-top">
        {kind === 'required' && granted ? (
          <span className="text-[11px] text-fg-subtle">Uninstall to revoke</span>
        ) : granted ? (
          <button
            type="button"
            onClick={() => onRevoke?.(plugin.id, permission)}
            disabled={!onRevoke}
            aria-label={`Revoke ${permission} from ${plugin.id}`}
            className="rounded-md border border-red-500/40 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revoke
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onGrant?.(plugin.id, permission)}
            disabled={!onGrant}
            aria-label={`Grant ${permission} to ${plugin.id}`}
            className="rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Grant
          </button>
        )}
      </td>
    </tr>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <h3 className="text-[12px] font-medium text-fg">{title}</h3>
      <p className="text-[11px] text-fg-muted">{message}</p>
    </div>
  );
}

function SupervisionMatrix({
  plugins,
  onReEnable,
}: {
  plugins: ActivePlugin[];
  onReEnable: ((pluginId: string) => void) | undefined;
}) {
  return (
    <section
      className="border-b border-edge px-4 py-3"
      aria-labelledby="permissions-supervision-heading"
    >
      <header className="mb-2 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
        <h3
          id="permissions-supervision-heading"
          className="text-[13px] font-semibold text-fg"
        >
          Plugin status
        </h3>
        <span className="text-[10px] text-fg-subtle">
          Crash budget + supervisor state
        </span>
      </header>
      <ul className="divide-y divide-edge/60 rounded-lg border border-edge bg-canvas">
        {plugins.map((plugin) => (
          <SupervisionRow
            key={plugin.id}
            plugin={plugin}
            onReEnable={onReEnable}
          />
        ))}
      </ul>
    </section>
  );
}

function SupervisionRow({
  plugin,
  onReEnable,
}: {
  plugin: ActivePlugin;
  onReEnable: ((pluginId: string) => void) | undefined;
}) {
  // Caller guarantees supervision is defined (Filter in
  // SupervisionMatrix), but defensive narrow keeps tsc happy + the
  // type-narrowing simple.
  const sup = plugin.supervision;
  if (!sup) return null;
  const isDisabled = sup.status === 'disabled';
  const barClass = crashBudgetBarClass(sup.crashBudget.used, isDisabled);
  const budgetPct = crashBudgetPercent(sup.crashBudget.used, sup.crashBudget.max);
  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-[11px] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_PILL_CLASS[sup.status]}`}
        >
          {STATUS_LABEL[sup.status]}
        </span>
        <div className="min-w-0">
          <div className="truncate text-fg">{plugin.name}</div>
          <div className="truncate font-mono text-[10px] text-fg-subtle">
            {plugin.id}
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-3 sm:max-w-md sm:justify-end">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-fg-subtle">
            Crashes {sup.crashBudget.used}/{sup.crashBudget.max} ({sup.crashBudget.windowSecs}s)
          </span>
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={sup.crashBudget.max}
            aria-valuenow={sup.crashBudget.used}
            aria-label={`Crash budget for ${plugin.id}`}
          >
            <div className={`h-full ${barClass}`} style={{ width: `${budgetPct}%` }} />
          </div>
        </div>
        <span className="text-fg-subtle">Restarts: {sup.restartCount}</span>
        {isDisabled && onReEnable && (
          <button
            type="button"
            onClick={() => onReEnable(plugin.id)}
            aria-label={`Re-enable ${plugin.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Re-enable
          </button>
        )}
      </div>
      {isDisabled && sup.disableReason !== undefined && (
        <p className="basis-full text-[10px] text-red-200 sm:basis-auto sm:ml-2">
          {DISABLE_REASON_LABEL[sup.disableReason] ?? sup.disableReason}
        </p>
      )}
    </li>
  );
}
