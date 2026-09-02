/**
 * I9.11 — cross-cutting smoke for every first-party bundled plugin.
 *
 * The nine first-party `.plx` plugins planned in `plamenix/docs/plugin-architecture.md`
 * §16 / I4 land in M1 as either:
 *
 *   - **In-binary built-ins** (registered via `registerBuiltin*` from
 *     `@plamenix/ui`) — eight of the nine.
 *   - **A real `.plx` example bundle** — the JSON cell renderer at
 *     `plamenix-core/crates/plamenix-plugin-host/examples/json-cell-renderer/`,
 *     covered end-to-end across both editions by the Rust integration
 *     test at `plamenix-plugin-host/tests/json_renderer_smoke.rs` (I9.2).
 *
 * Per-plugin coverage already exists in each adjacent `*.test.{ts,tsx}`
 * file. This file is the **cross-cutting** smoke: register every TS-side
 * built-in into one process-wide registry + assert each one surfaces at
 * the expected extension point with no collisions, then tear them all
 * down and assert the registry is empty. The goal isn't to re-prove what
 * the per-plugin tests already prove; it's to catch regressions where one
 * built-in's registration shadows or clobbers another's, or where a new
 * built-in lands without being added to the boot sequence.
 *
 * The smoke deliberately doesn't depend on shell components (ResultTable,
 * SchemaBrowser, WelcomeDashboard) — those wire each built-in via
 * `useEffect` at mount, and their per-component tests cover their own
 * registration call sites. This test exercises the registrars themselves,
 * which is what matters for the cross-edition guarantee: if the function
 * runs cleanly under vitest's jsdom environment, it runs cleanly inside
 * the Tauri webview and the web edition's React tree.
 *
 * **Editions are NOT exercised here in TypeScript.** Every built-in below
 * runs on top of the registry singleton, which has no edition concept —
 * the registry is a process-wide singleton in both editions (per
 * `@plamenix/ui` design). Edition-specific differences (file picker,
 * keyring, server-mediated grants) live ABOVE the registry, in the
 * shell. The Rust-side `tests/json_renderer_smoke.rs` exercises the
 * `Edition::Desktop` vs `Edition::Web` predicates at the host level for
 * the one bundle that IS a `.plx`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILTIN_NAMESPACE, isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';

import { registerBuiltinBlobRenderer } from './blob-cell-renderer.js';
import { registerBuiltinCsvExport } from './csv-export.js';
import { registerBuiltinDbaToolbox } from './dba-toolbox.js';
import { registerBuiltinFirebirdTips } from './firebird-tips-pack.js';
import { registerBuiltinJsonExport } from './json-export.js';
import { registerBuiltinSqlExport } from './sql-export.js';
import { registerBuiltinXlsxExport } from './xlsx-export.js';
import { registerBuiltinXmlExport } from './xml-export.js';

import type { ExtensionPoint } from '../../plugin-react/types.js';

/**
 * One row per first-party TS-side built-in. The 9th plugin (the JSON
 * cell renderer `.plx`) is covered by the Rust integration test cited
 * above; it has no TS registrar.
 */
const BUNDLED: ReadonlyArray<{
  readonly tracker: string;
  readonly pluginId: string;
  readonly extensionPoint: ExtensionPoint;
  readonly contributionId: string;
  readonly mount: () => () => void;
}> = [
  {
    tracker: 'I4.1',
    pluginId: `${BUILTIN_NAMESPACE}blob-renderer`,
    extensionPoint: 'cell_renderers',
    contributionId: 'blob',
    mount: () => registerBuiltinBlobRenderer(vi.fn()),
  },
  {
    tracker: 'I4.2',
    pluginId: `${BUILTIN_NAMESPACE}csv-export`,
    extensionPoint: 'export_formats',
    contributionId: 'csv',
    mount: () => registerBuiltinCsvExport(),
  },
  {
    tracker: 'I4.3',
    pluginId: `${BUILTIN_NAMESPACE}json-export`,
    extensionPoint: 'export_formats',
    contributionId: 'json',
    mount: () => registerBuiltinJsonExport(),
  },
  {
    tracker: 'I4.4',
    pluginId: `${BUILTIN_NAMESPACE}sql-export`,
    extensionPoint: 'export_formats',
    contributionId: 'sql',
    mount: () => registerBuiltinSqlExport(),
  },
  {
    tracker: 'I4.5',
    pluginId: `${BUILTIN_NAMESPACE}xml-export`,
    extensionPoint: 'export_formats',
    contributionId: 'xml',
    mount: () => registerBuiltinXmlExport(),
  },
  {
    tracker: 'I4.6',
    pluginId: `${BUILTIN_NAMESPACE}xlsx-export`,
    extensionPoint: 'export_formats',
    contributionId: 'xlsx',
    mount: () => registerBuiltinXlsxExport(),
  },
  {
    tracker: 'I4.7',
    pluginId: `${BUILTIN_NAMESPACE}firebird-tips`,
    extensionPoint: 'tip_packs',
    contributionId: 'firebird-default',
    mount: () => registerBuiltinFirebirdTips(),
  },
  {
    tracker: 'I4.8',
    pluginId: `${BUILTIN_NAMESPACE}dba-toolbox`,
    extensionPoint: 'schema_actions',
    // dba-toolbox registers two contributions; this smoke asserts the
    // first one's id (recreate-table) is present — the dedicated
    // `dba-toolbox.test.ts` file covers the second (recompute-statistics)
    // + per-action payload shape.
    contributionId: 'recreate-table',
    mount: () => registerBuiltinDbaToolbox(),
  },
];

describe('I9.11 — cross-cutting bundled-plugins smoke', () => {
  beforeEach(() => {
    registry.__reset();
  });

  afterEach(() => {
    registry.__reset();
  });

  it('registers every first-party built-in into one process-wide registry without collision', () => {
    const teardowns = BUNDLED.map((entry) => entry.mount());
    expect(teardowns).toHaveLength(BUNDLED.length);

    // Each built-in surfaces under its planned extension point + id.
    for (const { pluginId, extensionPoint, contributionId, tracker } of BUNDLED) {
      const matches = registry
        .getContributions(extensionPoint)
        .filter((entry) => entry.pluginId === pluginId);
      expect(
        matches.length,
        `${tracker} (${pluginId}) — expected at least one contribution at ${extensionPoint}`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        matches.some((m) => m.contribution.id === contributionId),
        `${tracker} (${pluginId}) — expected contribution id "${contributionId}" at ${extensionPoint}`,
      ).toBe(true);
    }

    // Every registered plugin id is built-in-namespaced — no leak of
    // sideloaded reverse-DNS ids through the boot path.
    const allRegisteredPluginIds = new Set<string>();
    for (const point of new Set(BUNDLED.map((b) => b.extensionPoint))) {
      for (const entry of registry.getContributions(point)) {
        allRegisteredPluginIds.add(entry.pluginId);
      }
    }
    for (const id of allRegisteredPluginIds) {
      expect(isBuiltinPlugin(id), `${id} should be built-in-namespaced`).toBe(true);
    }

    // Plugin-id-level uniqueness — the eight built-ins claim eight
    // distinct ids. Regression guard for two built-ins accidentally
    // sharing a name slug.
    const declaredIds = new Set(BUNDLED.map((b) => b.pluginId));
    expect(declaredIds.size).toBe(BUNDLED.length);
  });

  it('all five export formats coexist on the same extension point with distinct ids', () => {
    // Section I4.2–I4.6 ships five built-ins that all target
    // `export_formats`. Regression guard against any one of them
    // overwriting another via shared id or via the registry's
    // overwrite-on-same-plugin-id rule.
    for (const entry of BUNDLED) {
      if (entry.extensionPoint === 'export_formats') entry.mount();
    }
    const ids = registry
      .getContributions('export_formats')
      .map((entry) => entry.contribution.id);
    expect(new Set(ids)).toEqual(new Set(['csv', 'json', 'sql', 'xml', 'xlsx']));
  });

  it('teardown closures return the registry to empty', () => {
    const teardowns = BUNDLED.map((entry) => entry.mount());
    for (const teardown of teardowns) teardown();

    for (const point of new Set(BUNDLED.map((b) => b.extensionPoint))) {
      expect(
        registry.getContributions(point),
        `${point} should be empty after teardown`,
      ).toHaveLength(0);
    }
  });

  it('re-registration after teardown produces identical contribution shape', () => {
    // Catches a built-in mutating its module-level state on the way out
    // so that the second `register*` call lands with stale or different
    // payloads.
    const firstShape = BUNDLED.map((entry) => {
      const teardown = entry.mount();
      const contributions = registry
        .getContributions(entry.extensionPoint)
        .filter((c) => c.pluginId === entry.pluginId);
      teardown();
      return contributions.map((c) => ({
        id: c.contribution.id,
        priority: c.contribution.priority,
      }));
    });

    registry.__reset();

    const secondShape = BUNDLED.map((entry) => {
      const teardown = entry.mount();
      const contributions = registry
        .getContributions(entry.extensionPoint)
        .filter((c) => c.pluginId === entry.pluginId);
      teardown();
      return contributions.map((c) => ({
        id: c.contribution.id,
        priority: c.contribution.priority,
      }));
    });

    expect(secondShape).toEqual(firstShape);
  });
});
