import { useState, type ComponentType } from 'react';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Layers,
  Plug,
  ShieldAlert,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { ActivePlugin, SidebarPanelInfo } from './types';

export interface PluginsSidebarProps {
  plugins: ActivePlugin[];
  /** Fired when a contributed sidebar panel is clicked. Hosts open
   *  whatever surface they want — a side pane, a modal, a new tab. */
  onPickPanel?: (plugin: ActivePlugin, panel: SidebarPanelInfo) => void;
}

/**
 * Sidebar footer that lists every active plugin's contributed sidebar
 * panels. Collapsible per-plugin so users can dismiss noisy plugins.
 * Plugins that contribute nothing still show up so the user knows the
 * host loaded them.
 */
export function PluginsSidebar({ plugins, onPickPanel }: PluginsSidebarProps) {
  return (
    <aside className="border-t border-edge bg-panel text-xs">
      <header className="flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
        <Plug className="h-3 w-3 text-fg-subtle" />
        <span>Plugins</span>
        <span className="ml-auto font-mono text-[10px] text-fg-subtle">{plugins.length}</span>
      </header>
      {plugins.length === 0 ? (
        <p className="border-t border-edge px-3 py-2 text-[11px] italic text-fg-subtle">
          No plugins loaded.
        </p>
      ) : (
        <div className="border-t border-edge">
          {plugins.map((p) => (
            <PluginRow key={p.id} plugin={p} onPickPanel={onPickPanel} />
          ))}
        </div>
      )}
    </aside>
  );
}

function PluginRow({
  plugin,
  onPickPanel,
}: {
  plugin: ActivePlugin;
  onPickPanel: ((plugin: ActivePlugin, panel: SidebarPanelInfo) => void) | undefined;
}) {
  const [open, setOpen] = useState(true);
  const failed = plugin.activation.status === 'failed';

  return (
    <div className="border-b border-edge last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-fg-subtle" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" />
        )}
        {failed ? (
          <XCircle className="h-3 w-3 shrink-0 text-danger" />
        ) : plugin.pendingPermissions.length > 0 ? (
          <ShieldAlert
            className="h-3 w-3 shrink-0 text-warning"
            aria-label={`${plugin.pendingPermissions.length} pending permission${plugin.pendingPermissions.length === 1 ? '' : 's'}`}
          />
        ) : (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
        )}
        <span className="truncate font-mono text-[12px] text-fg" title={plugin.id}>
          {plugin.name}
        </span>
        <span className="ml-auto font-mono text-[10px] text-fg-subtle">v{plugin.version}</span>
      </button>
      {open && (
        <div className="border-t border-edge-subtle">
          {failed && plugin.activation.status === 'failed' && (
            <div className="flex items-start gap-2 px-3 py-2 text-[11px] text-danger">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{plugin.activation.message}</span>
            </div>
          )}
          {plugin.sidebarPanels.length > 0 && (
            <ul>
              {plugin.sidebarPanels.map((panel) => {
                const Icon = resolveIcon(panel.icon);
                return (
                  <li key={panel.id}>
                    <button
                      type="button"
                      onClick={() => onPickPanel?.(plugin, panel)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate text-[12px] text-fg-muted">{panel.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {plugin.extensions && plugin.extensions.length > 0 && (
            <ul className="border-t border-edge-subtle">
              {plugin.extensions.map((ext) => (
                <li
                  key={ext.point}
                  className="flex items-center gap-2 px-3 py-1 text-[11px] text-fg-subtle"
                >
                  <Sparkles className="h-3 w-3 shrink-0 text-accent/60" />
                  <span className="truncate font-mono">{ext.point}</span>
                  <span className="ml-auto font-mono">×{ext.count}</span>
                </li>
              ))}
            </ul>
          )}
          {plugin.sidebarPanels.length === 0 &&
            (!plugin.extensions || plugin.extensions.length === 0) && (
              <p className="px-3 py-2 text-[11px] italic text-fg-subtle">No contributions.</p>
            )}
        </div>
      )}
    </div>
  );
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  database: Database,
  terminal: Terminal,
  layers: Layers,
  boxes: Boxes,
  filetext: FileText,
};

function resolveIcon(name: string | null | undefined): ComponentType<{ className?: string }> {
  if (!name) return Sparkles;
  return ICONS[name.toLowerCase()] ?? Sparkles;
}
