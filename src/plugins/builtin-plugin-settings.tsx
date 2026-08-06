/**
 * Per-plugin settings panels for the six most-configurable built-ins.
 *
 * Each panel registers a `settings_panels` contribution under the same
 * `@plamenix-builtin/<id>` namespace its parent built-in uses. The
 * [`PluginsPage`] filters contributions by `pluginId` and renders the
 * panel inline in the matching plugin card.
 *
 * The remaining 13 built-ins have no meaningful runtime config today —
 * the placeholder PluginsPage section ("No settings") is the honest
 * surface until M2 widens the configurable surface.
 */

import { useDisplayStore } from '../db/display-store.js';
import { registerContributions, unregisterPlugin } from '../plugin-react/registry.js';
import { BUILTIN_NAMESPACE } from '../plugin-react/builtin.js';
import type { SettingsPanelContributionPayload } from '../settings-panels/settings-panel-contract.js';

const PANELS: ReadonlyArray<{
  pluginName: string;
  panel: SettingsPanelContributionPayload;
}> = [
  {
    pluginName: 'csv-export',
    panel: {
      title: 'Delimiter',
      description: 'Field separator the CSV exporter writes between cells.',
      Component: CsvDelimiterPanel,
    },
  },
  {
    pluginName: 'json-export',
    panel: {
      title: 'Indent',
      description: 'Spaces of indentation in exported JSON. 0 → minified.',
      Component: JsonIndentPanel,
    },
  },
  {
    pluginName: 'sql-export',
    panel: {
      title: 'Default: include DDL',
      description: 'When checked, SQL exports prefix INSERTs with a generated CREATE TABLE.',
      Component: SqlIncludeDdlPanel,
    },
  },
  {
    pluginName: 'blob-renderer',
    panel: {
      title: 'Hex preview length',
      description: 'Hex bytes shown in the result-table BLOB button. Range 4-64.',
      Component: BlobHexPreviewPanel,
    },
  },
  {
    pluginName: 'firebird-tips',
    panel: {
      title: 'Rotation interval',
      description: 'Auto-rotate the Firebird tips card every N seconds. 0 → disabled.',
      Component: TipRotationPanel,
    },
  },
  {
    pluginName: 'basic-sql-formatter',
    panel: {
      title: 'Formatter',
      description: 'Keyword case + indent size the basic SQL formatter emits.',
      Component: SqlFormatterPanel,
    },
  },
];

/**
 * Registers every per-plugin settings panel. Call once on shell boot
 * alongside the other `registerBuiltin*` mounts.
 */
export function registerBuiltinPluginSettings(): () => void {
  for (const { pluginName, panel } of PANELS) {
    registerContributions(`${BUILTIN_NAMESPACE}${pluginName}-settings`, {
      settings_panels: [
        {
          id: 'settings',
          priority: 200,
          payload: panel,
        },
      ],
    });
  }
  return () => unregisterBuiltinPluginSettings();
}

export function unregisterBuiltinPluginSettings(): void {
  for (const { pluginName } of PANELS) {
    unregisterPlugin(`${BUILTIN_NAMESPACE}${pluginName}-settings`);
  }
}

/**
 * Map from settings-helper plugin id → host plugin id. PluginsPage
 * uses this to attribute each panel to the right card.
 */
export const SETTINGS_HELPER_TO_HOST: ReadonlyMap<string, string> = new Map(
  PANELS.map(({ pluginName }) => [
    `${BUILTIN_NAMESPACE}${pluginName}-settings`,
    `${BUILTIN_NAMESPACE}${pluginName}`,
  ]),
);

/* ---------- panel components ---------- */

function CsvDelimiterPanel() {
  const value = useDisplayStore((s) => s.csvDelimiter);
  const set = useDisplayStore((s) => s.setCsvDelimiter);
  return (
    <div className="flex items-center gap-3">
      {([',', ';', '\t'] as const).map((d) => (
        <label
          key={d}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted"
        >
          <input
            type="radio"
            name="csv-delim"
            checked={value === d}
            onChange={() => set(d)}
            className="accent-accent"
          />
          <span className="font-mono">{d === '\t' ? '\\t' : d}</span>
        </label>
      ))}
    </div>
  );
}

function JsonIndentPanel() {
  const value = useDisplayStore((s) => s.jsonIndent);
  const set = useDisplayStore((s) => s.setJsonIndent);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={8}
        step={1}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="accent-accent"
      />
      <span className="w-16 text-right font-mono text-xs text-fg-muted">{value} sp</span>
    </div>
  );
}

function SqlIncludeDdlPanel() {
  const value = useDisplayStore((s) => s.exportIncludeDdl);
  const set = useDisplayStore((s) => s.setExportIncludeDdl);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
        className="accent-accent"
      />
      <span>Include CREATE TABLE header in SQL exports</span>
    </label>
  );
}

function BlobHexPreviewPanel() {
  const value = useDisplayStore((s) => s.blobHexPreviewLength);
  const set = useDisplayStore((s) => s.setBlobHexPreviewLength);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={4}
        max={64}
        step={2}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="accent-accent"
      />
      <span className="w-20 text-right font-mono text-xs text-fg-muted">{value} bytes</span>
    </div>
  );
}

function TipRotationPanel() {
  const ms = useDisplayStore((s) => s.tipRotationMs);
  const set = useDisplayStore((s) => s.setTipRotationMs);
  const seconds = Math.round(ms / 1000);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={60}
        step={1}
        value={seconds}
        onChange={(e) => set(Number(e.target.value) * 1000)}
        className="accent-accent"
      />
      <span className="w-20 text-right font-mono text-xs text-fg-muted">
        {seconds === 0 ? 'off' : `${seconds}s`}
      </span>
    </div>
  );
}

function SqlFormatterPanel() {
  const kw = useDisplayStore((s) => s.sqlFormatterKeywordCase);
  const setKw = useDisplayStore((s) => s.setSqlFormatterKeywordCase);
  const indent = useDisplayStore((s) => s.sqlFormatterIndentSize);
  const setIndent = useDisplayStore((s) => s.setSqlFormatterIndentSize);
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-[11px] text-fg-subtle">Keyword case</span>
        {(['upper', 'lower', 'preserve'] as const).map((c) => (
          <label
            key={c}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted"
          >
            <input
              type="radio"
              name="sqlfmt-case"
              checked={kw === c}
              onChange={() => setKw(c)}
              className="accent-accent"
            />
            <span>{c}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-[11px] text-fg-subtle">Indent size</span>
        <input
          type="range"
          min={2}
          max={8}
          step={1}
          value={indent}
          onChange={(e) => setIndent(Number(e.target.value))}
          className="accent-accent"
        />
        <span className="w-16 text-right font-mono text-xs text-fg-muted">{indent} sp</span>
      </div>
    </div>
  );
}
