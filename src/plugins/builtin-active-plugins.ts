/**
 * Built-in → `ActivePlugin` synthesizer.
 *
 * Both editions' shells fetch wasm-plugin lifecycle info from the Rust
 * host (`plugin_list_active` Tauri command on desktop, equivalent
 * Fastify route on web) and feed it into [`PluginsSidebar`]. That feed
 * is **wasm-only** — it doesn't surface the eight in-binary built-ins
 * registered via `registerBuiltin*` from `@plamenix/ui` because those
 * never enter the Rust host's `PluginsState`.
 *
 * `buildBuiltinActivePlugins()` reads the process-wide TS registry,
 * groups every contribution by plugin id, and emits [`ActivePlugin`]
 * entries the shell can merge with the Rust-side list before passing
 * the combined array to [`PluginsSidebar`]. Built-ins always report
 * `activation.status = 'ok'` (they cannot fail activation — they're
 * compiled into the bundle) and zero permissions (they bypass the
 * capability grammar).
 */

import { BUILTIN_NAMESPACE } from '../plugin-react/builtin.js';
import { registry } from '../plugin-react/registry.js';
import type { ExtensionPoint } from '../plugin-react/types.js';
import type { ActivePlugin, SidebarPanelInfo } from './types.js';

/**
 * Static metadata for every built-in. The plugin id (full
 * `BUILTIN_NAMESPACE`-prefixed form) is the registry key; `name` is the
 * label `PluginsSidebar` renders.
 */
const BUILTIN_META: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}> = [
  { id: `${BUILTIN_NAMESPACE}blob-renderer`,           name: 'BLOB cell renderer',     description: 'Default renderer for BLOB cells.' },
  { id: `${BUILTIN_NAMESPACE}csv-export`,              name: 'CSV export',             description: 'RFC 4180 CSV exporter.' },
  { id: `${BUILTIN_NAMESPACE}json-export`,             name: 'JSON export',            description: '2-space-indented JSON exporter.' },
  { id: `${BUILTIN_NAMESPACE}sql-export`,              name: 'SQL export',             description: 'INSERT-statement exporter with optional DDL header.' },
  { id: `${BUILTIN_NAMESPACE}xml-export`,              name: 'XML export',             description: 'Row-per-row XML exporter.' },
  { id: `${BUILTIN_NAMESPACE}xlsx-export`,             name: 'XLSX export',            description: 'write-excel-file backed XLSX exporter (lazy import).' },
  { id: `${BUILTIN_NAMESPACE}firebird-tips`,           name: 'Firebird tips pack',     description: '32 Firebird-specific tips surfaced in the WelcomeDashboard.' },
  { id: `${BUILTIN_NAMESPACE}dba-toolbox`,             name: 'DBA toolbox',            description: 'RECREATE TABLE + Recompute index statistics schema actions.' },
  { id: `${BUILTIN_NAMESPACE}schema-context-menu`,     name: 'Schema context menu',    description: 'Per-kind right-click items in the schema browser.' },
  { id: `${BUILTIN_NAMESPACE}default-keybindings`,     name: 'Default keybindings',    description: 'Shell-wide keyboard shortcuts.' },
  { id: `${BUILTIN_NAMESPACE}table-inspector-tabs`,    name: 'Table inspector tabs',   description: 'Built-in tabs on the table-object inspector.' },
  { id: `${BUILTIN_NAMESPACE}basic-sql-formatter`,     name: 'Basic SQL formatter',    description: 'Default SQL formatter — uppercase keywords, simple indentation.' },
  { id: `${BUILTIN_NAMESPACE}password-auth-provider`,  name: 'Password auth provider', description: 'Username + password connection form.' },
  { id: `${BUILTIN_NAMESPACE}default-themes`,          name: 'Default themes',         description: 'Stock light + dark palettes.' },
  { id: `${BUILTIN_NAMESPACE}default-settings-sections`, name: 'Default settings panels', description: 'Built-in sections rendered in the settings page.' },
  { id: `${BUILTIN_NAMESPACE}default-dashboard-sections`, name: 'Default dashboard sections', description: 'Built-in cards on the welcome dashboard.' },
  { id: `${BUILTIN_NAMESPACE}default-status-bar-items`, name: 'Default status-bar items', description: 'Built-in entries in the bottom status bar.' },
  { id: `${BUILTIN_NAMESPACE}firebird-keywords-completion`, name: 'Firebird keyword completion', description: 'CodeMirror SQL autocomplete source for Firebird keywords.' },
  { id: `${BUILTIN_NAMESPACE}basic-syntax-diagnostic`, name: 'Basic SQL diagnostics',  description: 'Inline syntax-error diagnostics for the SQL editor.' },
  { id: `${BUILTIN_NAMESPACE}csv-importer`,            name: 'CSV importer',           description: 'CSV → INSERT import source.' },
];

const EXTENSION_POINTS: ReadonlyArray<ExtensionPoint> = [
  'cell_renderers',
  'cell_editors',
  'export_formats',
  'import_sources',
  'sidebar_panels',
  'toolbar_buttons',
  'object_inspectors',
  'schema_actions',
  'sql_formatters',
  'auth_providers',
  'tip_packs',
  'themes',
  'settings_panels',
  'dashboard_sections',
  'status_bar_items',
  'completion_providers',
  'diagnostics_providers',
  'commands',
  'keybindings',
  'menus',
];

/**
 * Walks the TS registry + emits an `ActivePlugin` per registered
 * built-in plugin id. Plugins with zero registered contributions are
 * omitted — the shell only shows what's actually live.
 *
 * Pair with the Rust-host's `plugin_list_active` feed in App.tsx:
 *
 * ```ts
 * const wasm = await transport.invoke<ActivePlugin[]>('plugin_list_active');
 * const builtins = buildBuiltinActivePlugins();
 * setPlugins([...builtins, ...wasm]);
 * ```
 */
export function buildBuiltinActivePlugins(): ActivePlugin[] {
  // Walk every extension point once; bucket contributions by pluginId.
  const byPlugin = new Map<string, Map<ExtensionPoint, number>>();
  for (const point of EXTENSION_POINTS) {
    for (const entry of registry.getContributions(point)) {
      if (!entry.pluginId.startsWith(BUILTIN_NAMESPACE)) continue;
      let bucket = byPlugin.get(entry.pluginId);
      if (!bucket) {
        bucket = new Map();
        byPlugin.set(entry.pluginId, bucket);
      }
      bucket.set(point, (bucket.get(point) ?? 0) + 1);
    }
  }

  const result: ActivePlugin[] = [];
  // Order: meta-listed built-ins first, in declaration order; any
  // registered-but-unlisted built-in id falls in afterwards. Stable
  // ordering avoids reshuffling the sidebar between renders.
  const seen = new Set<string>();
  for (const meta of BUILTIN_META) {
    const buckets = byPlugin.get(meta.id);
    if (!buckets) continue;
    result.push(synthesize(meta.id, meta.name, meta.description, buckets));
    seen.add(meta.id);
  }
  for (const [pluginId, buckets] of byPlugin) {
    if (seen.has(pluginId)) continue;
    // Per-plugin settings helpers register under
    // `@plamenix-builtin/<id>-settings` to keep their own teardown
    // independent. PluginsPage attributes them back to the host
    // plugin via `SETTINGS_HELPER_TO_HOST`; they MUST NOT surface as
    // separate cards.
    if (pluginId.endsWith('-settings')) continue;
    const name = pluginId.slice(BUILTIN_NAMESPACE.length) || pluginId;
    result.push(synthesize(pluginId, name, undefined, buckets));
  }
  return result;
}

function synthesize(
  pluginId: string,
  name: string,
  description: string | undefined,
  buckets: Map<ExtensionPoint, number>,
): ActivePlugin {
  // Built-in `sidebar_panels` contributions DO surface as clickable
  // entries in the existing PluginsSidebar list. Everything else is
  // counted + surfaced via the new "extensions" path the sidebar
  // renders below the sidebar-panels block.
  const sidebarPanels: SidebarPanelInfo[] = [];
  for (const entry of registry.getContributions('sidebar_panels')) {
    if (entry.pluginId !== pluginId) continue;
    const payload = entry.contribution.payload as { label?: unknown; icon?: unknown };
    const label = typeof payload?.label === 'string' ? payload.label : entry.contribution.id;
    const icon = typeof payload?.icon === 'string' ? payload.icon : null;
    sidebarPanels.push({ id: entry.contribution.id, label, icon });
  }

  return {
    id: pluginId,
    name,
    version: '1.0.0-beta',
    description: description ?? null,
    sidebarPanels,
    logs: [],
    activation: { status: 'ok' },
    requiredPermissions: [],
    optionalPermissions: [],
    grantedPermissions: [],
    pendingPermissions: [],
    // Built-ins bypass the supervisor; omit the field.
    extensions: Array.from(buckets, ([point, count]) => ({ point, count })),
  };
}
