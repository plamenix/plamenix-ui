/**
 * Object-inspector contribution contract (I5.4).
 *
 * Right-pane inspector tabs for schema-browser objects (tables,
 * views, procedures, triggers, generators, domains). The shell
 * renders one tab per matching contribution; clicking a tab swaps
 * the body to the contribution's `Component`, which receives the
 * focused object + host-supplied helpers via `ObjectInspectorContext`.
 *
 * Built-in `@plamenix-builtin/table-inspector-tabs` extracts the
 * three legacy table tabs (Data, Schema, DDL). Third-party plugins
 * add inspector tabs ("Statistics", "Permissions report", "Diff
 * against backup", "Profiling samples", etc.) without forking the
 * shell.
 *
 * Per-kind host helper shape: I5.4 ships with helpers for the
 * `table` kind (the existing `TableObjectView` surface). When
 * inspector surfaces for `view` / `procedure` / `trigger` / `generator`
 * / `domain` land in later sections, the helper shape extends with
 * per-kind fields; the union stays open so future fields slot in
 * without breaking existing contributions.
 */

import type { ComponentType } from 'react';
import type {
  ColumnValue,
  Schema,
  StatementOutcome,
} from '../db/types.js';
import type { StreamedExportRunner } from '../db/streamed-export.js';
import type { SchemaObjectKind } from '../db/schema-action-contract.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Host helpers passed to every inspector contribution's Component
 *  via `ObjectInspectorContext.host`. All fields optional — only the
 *  helpers the focused-object kind has wired today are populated.
 *
 *  - Today (`table` kind, `TableObjectView`): every field can be
 *    populated; the Data tab uses every shell-state callback.
 *  - Future per-kind surfaces (procedure / view / trigger / generator
 *    / domain inspectors) populate the subset they expose. */
export interface ObjectInspectorHostHelpers {
  /** Live result outcomes (Data-tab style consumers). */
  results?: StatementOutcome[] | null;
  /** Whole-database schema (for cross-table features like FK
   *  navigation in the Data tab). */
  schema?: Schema | null;
  /** Current session id (null when disconnected). */
  sessionId?: string | null;
  /** Tab the inspector is mounted in. Threaded through to inspector
   *  contributions that render `MultiResultView` (e.g. the built-in
   *  Data tab) so cell-commit / row-delete / row-insert events
   *  carry the originating tab id. */
  tabId?: string;
  /** Persisted column widths for the Data tab's result table. */
  columnWidths?: Record<string, number>;
  /** Re-run the `SELECT *` against the focused object. */
  onRefreshData?: () => void;
  onCommitCellEdit?: (sql: string) => Promise<void>;
  onApplyFilter?: (sql: string) => Promise<void>;
  onFetchBlob?: (blobId: string) => Promise<string>;
  onCountAllRows?: (args: { table: string; predicate: string | null }) => Promise<number>;
  onFetchScopedRows?: (args: {
    table: string;
    predicate: string | null;
  }) => Promise<{ cells: ColumnValue[] }[]>;
  onColumnWidthsChange?: (next: Record<string, number>) => void;
  onStreamedExport?: StreamedExportRunner;
}

/** Context handed to each inspector contribution's Component. */
export interface ObjectInspectorContext<TTarget = unknown> {
  /** Kind discriminator. Contributions filter by `applicableKinds`. */
  kind: SchemaObjectKind;
  /** Focused object metadata. Concrete shape depends on `kind`:
   *
   *    - `table` / `view` → `TableInfo`
   *    - `procedure` → `ProcedureInfo`
   *    - `trigger` → `TriggerInfo`
   *    - `generator` → `GeneratorInfo`
   *    - `domain` → `DomainInfo`
   *
   *  Contributions narrow at the Component site by typing
   *  `target as TableInfo` etc. */
  target: TTarget;
  /** Host-supplied helpers — see `ObjectInspectorHostHelpers`. */
  host: ObjectInspectorHostHelpers;
}

export interface ObjectInspectorContributionPayload {
  /** Display label shown on the tab button. Concise (`'Schema'`,
   *  `'DDL'`, `'Statistics'`). */
  label: string;
  /** Optional Lucide-style icon for the tab button. */
  icon?: ComponentType<{ className?: string }>;
  /** Schema-object kinds this inspector applies to. Tab surfaces in
   *  the inspector for any of the listed kinds. */
  applicableKinds: readonly SchemaObjectKind[];
  /** Body component. Receives `{ctx}` with the focused object +
   *  host helpers. Mounted only while the tab is active — unmounted
   *  when the user picks a different tab. */
  Component: ComponentType<{ ctx: ObjectInspectorContext }>;
}

/** Resolved tab descriptor ready for the inspector header. */
export interface ObjectInspectorTabDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. Used as the React key for the tab
   *  button + the persisted "active tab" id. */
  id: string;
  pluginId: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  Component: ComponentType<{ ctx: ObjectInspectorContext }>;
}

/** Filters + maps registry contributions for a given kind into tab
 *  descriptors ready for the inspector header. Registry priority
 *  order is preserved within the kind filter (lower = earlier =
 *  leftmost tab). */
export function pluginContributionsToInspectorTabs(
  contributions: ReadonlyArray<PluginContribution<ObjectInspectorContributionPayload>>,
  kind: SchemaObjectKind,
): ObjectInspectorTabDescriptor[] {
  const out: ObjectInspectorTabDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    if (!contribution.payload.applicableKinds.includes(kind)) continue;
    const desc: ObjectInspectorTabDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: contribution.payload.label,
      Component: contribution.payload.Component,
    };
    if (contribution.payload.icon !== undefined) {
      desc.icon = contribution.payload.icon;
    }
    out.push(desc);
  }
  return out;
}
