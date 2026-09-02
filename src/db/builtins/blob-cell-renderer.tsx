/**
 * Built-in BLOB cell renderer — first extraction (I4.1) of a
 * formerly-hardcoded `CellContent` switch branch into a
 * registry-registered cell renderer via the internal-server pattern
 * (`@plamenix-builtin/blob-renderer`).
 *
 * Visual + behaviour parity with the legacy default-switch branch
 * that stayed in `CellContent`: the same warning-tinted `BLOB`
 * button with the leading hex preview, the same click hook into the
 * shell's BlobViewer modal. The shell registers this built-in on
 * `ResultTable` mount by calling [`registerBuiltinBlobRenderer`]
 * with the live `openBlobViewer` callback; the registration is
 * idempotent (same plugin id) — subsequent mounts would throw at the
 * registry level, so the shell pairs the register call with a
 * cleanup `unregisterBuiltin('blob-renderer')` on unmount.
 *
 * **The default switch's blob branch is intentionally preserved as a
 * safety net** — environments that never call
 * `registerBuiltinBlobRenderer` (tests not exercising ResultTable,
 * future minimal renderers) keep working through the legacy path.
 * The built-in's `priority: 50` wins over the fallback whenever both
 * are present.
 */

import {
  registerBuiltin,
  unregisterBuiltin,
} from '../../plugin-react/builtin.js';
import type { BlobRef } from '../types.js';
import type {
  CellRendererContext,
  CellRendererPayload,
} from '../cell-renderer-contract.js';

/** Stable id within the built-in namespace. */
const BUILTIN_NAME = 'blob-renderer';

/**
 * Click callback passed by the shell at registration time. Closure-
 * captures whatever per-mount state `ResultTable` keeps (the host's
 * `openBlobViewer` is per-instance, not module-static, because each
 * result table opens the BlobViewer modal scoped to its own row + col
 * index — needed for the edit buffer cache).
 */
export type OpenBlobViewer = (
  cell: BlobRef,
  columnName: string,
  rowIndex: number,
  colIndex: number,
) => void;

/**
 * Registers the built-in BLOB cell renderer through the shared
 * registry. Call once per shell instance with the live
 * `openBlobViewer` callback; pair with [`unregisterBuiltinBlobRenderer`]
 * to clean up on shell teardown.
 *
 * Returns a teardown function for convenience in `useEffect`
 * patterns: `useEffect(() => registerBuiltinBlobRenderer(open), [])`.
 */
/**
 * Per-table viewers, keyed by the id in the renderer context.
 *
 * The registration used to take one `open` callback and close over it,
 * which meant it had to happen inside a `ResultTable` — so two tables
 * registered twice, and the registry throws on a duplicate. A
 * two-SELECT script therefore crashed the React root in both shells,
 * because neither has an error boundary. Refcounting alone would not
 * have fixed it: the first registration's closure would still have
 * routed the second table's clicks to the first table's viewer.
 */
const viewers = new Map<string, OpenBlobViewer>();

/**
 * Points this table's BLOB cells at its own viewer.
 *
 * @returns A disposer that unregisters the table. Call it on unmount,
 * or a closed table's viewer keeps receiving clicks.
 */
export function setBlobViewer(tableId: string, open: OpenBlobViewer): () => void {
  viewers.set(tableId, open);
  return () => {
    viewers.delete(tableId);
  };
}

export function registerBuiltinBlobRenderer(): () => void {
  const payload: CellRendererPayload = {
    matches: (ctx) => ctx.cell.type === 'blob',
    Component: function BuiltinBlobCell({ ctx }: { ctx: CellRendererContext }) {
      if (ctx.cell.type !== 'blob') return null;
      const ref = ctx.cell.value;
      const preview = ref.peekHex.slice(0, 16);
      const truncated = ref.sizeBytes * 2 > preview.length;
      return (
        <button
          type="button"
          onClick={() => viewers.get(ctx.tableId)?.(ref, ctx.columnName, ctx.rowIndex, ctx.colIndex)}
          title="Open BLOB viewer"
          className="inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-0.5 font-mono text-[10px] text-warning transition-colors hover:bg-warning hover:text-warning-subtle"
        >
          <span className="font-semibold">BLOB</span>
          <span>
            0x{preview}
            {truncated ? '…' : ''}
          </span>
        </button>
      );
    },
  };

  registerBuiltin(BUILTIN_NAME, {
    cell_renderers: [
      {
        id: 'blob',
        // Priority 50 wins over the host's default-switch fallback
        // (which has no registered priority — it's the
        // pickCellRenderer null-return path) but loses to higher-
        // priority third-party plugins that explicitly claim BLOB
        // cells (e.g. a future image-thumbnail plugin at priority
        // 10).
        priority: 50,
        payload,
      },
    ],
  });

  return () => {
    unregisterBuiltin(BUILTIN_NAME);
  };
}

/** Explicit teardown — alternative to the returned closure from
 *  `registerBuiltinBlobRenderer` for callers that prefer named
 *  cleanup over closure capture. */
export function unregisterBuiltinBlobRenderer(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
