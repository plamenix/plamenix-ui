/**
 * Import-source contribution contract (I5.14).
 *
 * Plugins contribute row-producing data sources for the Import wizard
 * through the `import_sources` extension point. Each contribution
 * supplies a `FormComponent` (the wizard renders this when its tab
 * is active — file picker, URL input, dump-file selector, OAuth flow,
 * etc.) plus an async `importRows(args)` function that returns an
 * `AsyncIterable<Row>` the wizard pipes through the host's
 * INSERT-execution pipeline.
 *
 * Built-in `@plamenix-builtin/import-csv` provides the canonical CSV
 * file source (client-side parsing of `,` / `;` / `\t` delimited
 * files with RFC 4180-ish quoted-field handling — the same rules the
 * I4.2 CSV export uses, run in reverse). Third-party plugins add
 * "Postgres dump", "MySQL dump", "JSON file", "Parquet file", "S3
 * fetch", "Google Sheets", "Excel (XLSX)", etc.
 *
 * **Scope note for M1**: this section ships the contract + the
 * `ImportWizardModal` component + the CSV built-in. Host wiring (a
 * button on the QueryPanel toolbar or TabStrip that opens the
 * wizard + the INSERT-execution pipeline that consumes the
 * AsyncIterable) lands in a follow-up section once concrete shell
 * surface decisions settle. The modal accepts an `onSubmit(rows,
 * target)` callback so host integration is a one-line wiring step
 * when ready.
 *
 * **AsyncIterable contract**: providers yield rows lazily — for a
 * large file, the wizard can pipe rows through the host's batched
 * INSERT path without materialising the entire dataset. Providers
 * SHOULD honour back-pressure (`for await ... of` from the consumer
 * naturally throttles), report progress via `args.onProgress` (when
 * supplied), and surface row-level parse errors via thrown values
 * (which the wizard catches + presents).
 */

import type { ComponentType } from 'react';
import type { Row, Schema } from '../db/types.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Context handed to every import provider's `FormComponent` and
 *  `importRows`. Carries the active session + schema so providers
 *  can populate target-table dropdowns, inspect column types for
 *  type-aware coercion, etc. */
export interface ImportContext {
  /** Active session id, or `null` when disconnected. */
  sessionId: string | null;
  /** Whole-database schema, used by providers that pick target tables
   *  from a dropdown + validate that the source columns align with
   *  the chosen target. */
  schema: Schema | null;
  /** Optional progress reporter. Providers call this with the
   *  cumulative row count to drive the wizard's progress bar. Wizard
   *  installs a default no-op when the host doesn't supply one. */
  onProgress?: (rowCount: number) => void;
}

/** Form state the provider's FormComponent owns. Opaque to the
 *  wizard — the wizard hands the FormComponent a `state` + `setState`
 *  pair (matching React's `useState`); when the user clicks Import
 *  the wizard passes the latest state to `importRows`. */
export interface ImportSourceFormProps<TState> {
  state: TState;
  setState: (next: TState) => void;
  ctx: ImportContext;
}

/** Arguments handed to `importRows(args)` at Import-button click. */
export interface ImportRowsArgs<TState> {
  /** Final form state captured before submit. */
  state: TState;
  /** Same context the FormComponent received. */
  ctx: ImportContext;
}

export interface ImportSourceContributionPayload<TState = unknown> {
  /** Display label shown in the wizard's tab strip (e.g. `'CSV file'`,
   *  `'Postgres dump'`, `'JSON file'`, `'Parquet file'`). */
  label: string;
  /** Optional Lucide-style icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Optional one-line description rendered under the tab. */
  description?: string;
  /** Initial form state. Wizard passes this as `state` on first
   *  mount of the FormComponent. */
  initialState: TState;
  /** Form widgets the wizard renders when this tab is active. */
  FormComponent: ComponentType<ImportSourceFormProps<TState>>;
  /** Asynchronously produces rows to insert into the target table.
   *  Lazy iteration — providers SHOULD avoid loading the entire
   *  dataset into memory. */
  importRows: (args: ImportRowsArgs<TState>) => AsyncIterable<Row>;
}

/** Resolved descriptor ready for the wizard's tab strip. */
export interface ImportSourceDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. */
  id: string;
  pluginId: string;
  label: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  /** Re-exposed for the wizard's tab body. */
  initialState: unknown;
  FormComponent: ComponentType<ImportSourceFormProps<unknown>>;
  importRows: (args: ImportRowsArgs<unknown>) => AsyncIterable<Row>;
}

/** Maps registry contributions into descriptors in registry priority
 *  order (lower = appears first in the wizard's tab strip). */
export function pluginContributionsToImportSources(
  contributions: ReadonlyArray<PluginContribution<ImportSourceContributionPayload>>,
): ImportSourceDescriptor[] {
  const out: ImportSourceDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    const p = contribution.payload;
    const desc: ImportSourceDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: p.label,
      description: p.description ?? '',
      initialState: p.initialState,
      FormComponent: p.FormComponent as ComponentType<ImportSourceFormProps<unknown>>,
      importRows: p.importRows as (args: ImportRowsArgs<unknown>) => AsyncIterable<Row>,
    };
    if (p.icon !== undefined) desc.icon = p.icon;
    out.push(desc);
  }
  return out;
}
