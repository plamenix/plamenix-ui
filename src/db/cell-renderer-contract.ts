/**
 * Cell-renderer contribution-point contract.
 *
 * Plugins (third-party or built-in via the internal-server pattern,
 * see `@plamenix/ui/plugin-react` `registerBuiltin`) contribute custom
 * renderers for the result-table's cell dispatch by registering at
 * the `cell_renderers` extension point with this payload shape.
 *
 * Predicate semantics: `matches(ctx)` runs for every cell at render
 * time. Returning `true` claims the cell — first matching contribution
 * (in priority order, lower-first) wins. Returning `false` lets the
 * next contribution try; if no contribution claims the cell, the
 * shell's default per-type dispatch (`null`/`text`/`integer`/`float`/
 * `bool`/`blob` styling) renders. Built-in feature extractions (the
 * BLOB viewer, future JSON-tree, image-thumb, color-swatch, etc.)
 * land in I4 as built-ins registered through this same contract.
 *
 * Keep `matches` cheap — it runs on every cell render. Heavy work
 * (regex compilation, schema lookups) should happen at module load
 * time and be cached in closures.
 */

import type { PluginContribution } from '../plugin-react/usePluginContributions.js';
import type { ColumnInfo, ColumnValue } from './types.js';

export interface CellRendererContext {
  /** The cell value, tagged-union form straight from the driver. */
  cell: ColumnValue;
  /** Header column name. Available in every cell context — `matches`
   *  predicates can branch on column names like `metadata_json`. */
  columnName: string;
  /** Full column metadata when the active result targets a base
   *  table; `null` for projected expressions or detached results
   *  where the driver did not surface column-info. */
  columnInfo: ColumnInfo | null;
  /** Zero-based row index within the current result page. */
  rowIndex: number;
  /** Zero-based column index within the current result row. Needed
   *  by built-in renderers that key host-side state by `(rowIndex,
   *  colIndex)` — e.g. the BLOB renderer's edit-buffer cache. */
  colIndex: number;
}

export interface CellRendererPayload {
  /**
   * Returns `true` when this renderer wants to claim the cell.
   * Called per cell render — keep it fast.
   */
  matches: (ctx: CellRendererContext) => boolean;
  /**
   * React component rendered when `matches` returns true. Receives
   * the full cell context so renderers do not have to thread `value`
   * + `columnName` + `columnInfo` separately.
   */
  Component: React.ComponentType<{ ctx: CellRendererContext }>;
}

/**
 * Walks the registered cell-renderer contributions in priority order
 * (the array is already sorted by the registry) and returns the first
 * payload whose `matches(ctx)` claims the cell. Returns `null` when
 * no contribution wants it — the caller falls through to the host's
 * built-in per-type dispatch.
 *
 * Extracted from `CellContent` so the dispatch logic is unit-testable
 * without spinning up the full ResultTable.
 */
export function pickCellRenderer(
  renderers: ReadonlyArray<PluginContribution<CellRendererPayload>>,
  ctx: CellRendererContext,
): CellRendererPayload | null {
  for (const { contribution } of renderers) {
    if (contribution.payload.matches(ctx)) {
      return contribution.payload;
    }
  }
  return null;
}
