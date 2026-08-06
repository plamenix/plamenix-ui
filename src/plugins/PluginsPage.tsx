/**
 * Full-page plugin manager.
 *
 * Lists every plugin the shell knows about — both built-ins (synthesised
 * via [`buildBuiltinActivePlugins`]) and wasm plugins (fed from the
 * Rust host's `plugin_list_active` feed). Renders each entry with:
 *
 *   - Name, id, version
 *   - Description
 *   - Activation status (ok / failed) with the failure message inline
 *   - sidebarPanels list when contributed
 *   - extension-point contribution counts (the new `extensions` field)
 *   - permission status (required + optional + pending + granted)
 *   - supervisor crash-budget + restart count when present
 *
 * This page is read-only on M1 — no enable/disable toggle, no per-plugin
 * config edits. Those land in M2 when the supervisor's pause/resume
 * surfaces. The deferred-consumer-wiring memory entry tracks the gap.
 */

import { ArrowLeft, AlertCircle, CheckCircle2, Plug, Settings, ShieldAlert, XCircle } from 'lucide-react';
import { usePluginContributions } from '../plugin-react/usePluginContributions.js';
import {
  pluginContributionsToSettingsPanels,
  type SettingsPanelContributionPayload,
  type SettingsPanelDescriptor,
} from '../settings-panels/settings-panel-contract.js';
import { SETTINGS_HELPER_TO_HOST } from './builtin-plugin-settings.js';
import type { ActivePlugin } from './types.js';

export interface PluginsPageProps {
  /** Combined active-plugin list (built-ins + wasm). */
  plugins: ActivePlugin[];
  /** Fires when the user clicks Back. */
  onClose: () => void;
  /** Optional override of the Back-button label. */
  backLabel?: string;
}

export function PluginsPage({ plugins, onClose, backLabel = 'Back' }: PluginsPageProps) {
  const totalContributions = plugins.reduce(
    (acc, p) =>
      acc +
      p.sidebarPanels.length +
      (p.extensions?.reduce((sum, ext) => sum + ext.count, 0) ?? 0),
    0,
  );
  const allSettingsPanels = pluginContributionsToSettingsPanels(
    usePluginContributions<SettingsPanelContributionPayload>('settings_panels'),
  );
  const settingsByPluginId = new Map<string, SettingsPanelDescriptor[]>();
  for (const desc of allSettingsPanels) {
    // Built-in settings helpers register under
    // `@plamenix-builtin/<id>-settings`. Attribute them back to the
    // host plugin (`@plamenix-builtin/<id>`) so the card filter hits.
    const hostId = SETTINGS_HELPER_TO_HOST.get(desc.pluginId) ?? desc.pluginId;
    const bucket = settingsByPluginId.get(hostId) ?? [];
    bucket.push(desc);
    settingsByPluginId.set(hostId, bucket);
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-canvas">
      <header className="relative shrink-0 overflow-hidden border-b border-edge bg-panel">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        />
        <div className="flex items-center gap-3 px-6 pt-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </button>
          <span className="flex-1" />
        </div>
        <div className="flex items-end gap-3 px-6 pb-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/30">
            <Plug className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-fg">Plugins</h1>
            <p className="truncate text-xs text-fg-muted">
              {plugins.length} loaded · {totalContributions} contributions across{' '}
              {plugins.reduce(
                (acc, p) => acc + (p.extensions?.length ?? 0) + (p.sidebarPanels.length > 0 ? 1 : 0),
                0,
              )}{' '}
              extension points
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        {plugins.length === 0 ? (
          <p className="rounded-md border border-edge bg-panel px-6 py-8 text-center text-sm italic text-fg-subtle">
            No plugins loaded.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {plugins.map((plugin) => (
              <li
                key={plugin.id}
                className="rounded-lg border border-edge bg-panel p-4 shadow-sm"
              >
                <PluginCardHeader plugin={plugin} />
                {plugin.description && (
                  <p className="mt-2 text-xs text-fg-muted">{plugin.description}</p>
                )}
                {plugin.activation.status === 'failed' && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="break-words">{plugin.activation.message}</span>
                  </div>
                )}
                <PluginContributionsBlock plugin={plugin} />
                <PluginPermissionsBlock plugin={plugin} />
                <PluginSettingsBlock settings={settingsByPluginId.get(plugin.id) ?? []} />
                {plugin.supervision && <PluginSupervisionBlock plugin={plugin} />}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function PluginCardHeader({ plugin }: { plugin: ActivePlugin }) {
  const failed = plugin.activation.status === 'failed';
  const pending = plugin.pendingPermissions.length;
  return (
    <header className="flex items-center gap-2">
      {failed ? (
        <XCircle className="h-4 w-4 shrink-0 text-danger" />
      ) : pending > 0 ? (
        <ShieldAlert
          className="h-4 w-4 shrink-0 text-warning"
          aria-label={`${pending} pending permission${pending === 1 ? '' : 's'}`}
        />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-fg" title={plugin.id}>
          {plugin.name}
        </h2>
        <p className="truncate font-mono text-[10px] text-fg-subtle">{plugin.id}</p>
      </div>
      <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 font-mono text-[10px] text-fg-muted">
        v{plugin.version}
      </span>
    </header>
  );
}

function PluginContributionsBlock({ plugin }: { plugin: ActivePlugin }) {
  const sidebarCount = plugin.sidebarPanels.length;
  const extensions = plugin.extensions ?? [];
  if (sidebarCount === 0 && extensions.length === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        Contributions
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {sidebarCount > 0 && (
          <li className="inline-flex items-center gap-1 rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[10px] text-fg-muted">
            <span>sidebar_panels</span>
            <span className="text-fg-subtle">×{sidebarCount}</span>
          </li>
        )}
        {extensions.map((ext) => (
          <li
            key={ext.point}
            className="inline-flex items-center gap-1 rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[10px] text-fg-muted"
          >
            <span>{ext.point}</span>
            <span className="text-fg-subtle">×{ext.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PluginPermissionsBlock({ plugin }: { plugin: ActivePlugin }) {
  const total =
    plugin.requiredPermissions.length +
    plugin.optionalPermissions.length;
  if (total === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        Permissions
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <dt className="text-fg-subtle">Required</dt>
        <dd className="text-fg-muted">{plugin.requiredPermissions.length}</dd>
        <dt className="text-fg-subtle">Optional</dt>
        <dd className="text-fg-muted">{plugin.optionalPermissions.length}</dd>
        <dt className="text-fg-subtle">Granted</dt>
        <dd className="text-success">{plugin.grantedPermissions.length}</dd>
        {plugin.pendingPermissions.length > 0 && (
          <>
            <dt className="text-warning">Pending</dt>
            <dd className="text-warning">{plugin.pendingPermissions.length}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function PluginSettingsBlock({ settings }: { settings: SettingsPanelDescriptor[] }) {
  if (settings.length === 0) {
    return (
      <section className="mt-3 rounded-md border border-dashed border-edge px-3 py-2">
        <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
          <Settings className="h-3 w-3" />
          Settings
        </h3>
        <p className="text-[11px] italic text-fg-subtle">No settings.</p>
      </section>
    );
  }
  return (
    <section className="mt-3 rounded-md border border-edge bg-elevated">
      <h3 className="flex items-center gap-1.5 border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        <Settings className="h-3 w-3" />
        Settings
      </h3>
      <div className="divide-y divide-edge">
        {settings.map((desc) => {
          const Body = desc.Component;
          return (
            <div key={desc.id} className="px-3 py-3">
              <h4 className="mb-1 text-xs font-semibold text-fg">{desc.title}</h4>
              {desc.description && (
                <p className="mb-2 text-[11px] text-fg-muted">{desc.description}</p>
              )}
              <Body />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PluginSupervisionBlock({ plugin }: { plugin: ActivePlugin }) {
  const sup = plugin.supervision;
  if (!sup) return null;
  return (
    <section className="mt-3 rounded-md bg-elevated px-3 py-2">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        Supervision
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        <dt className="text-fg-subtle">Status</dt>
        <dd className="font-mono text-fg-muted">{sup.status}</dd>
        <dt className="text-fg-subtle">Restart policy</dt>
        <dd className="font-mono text-fg-muted">{sup.restartPolicy}</dd>
        <dt className="text-fg-subtle">Restarts</dt>
        <dd className="font-mono text-fg-muted">{sup.restartCount}</dd>
      </dl>
    </section>
  );
}
