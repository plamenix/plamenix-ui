import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, Database, Inbox } from 'lucide-react';
import type { ColumnValue, QueryResult } from './types';

export interface ResultTableProps {
  /** Outcome of the most recent `db.execute` call. */
  result: QueryResult;
  /** Pixel height of the scroll viewport. Defaults to 480; pass a
   *  smaller value when embedding inside a tighter container. */
  height?: number;
}

/** Estimated row height fed to TanStack Virtual. Real measurement
 *  happens through `measureElement`; this only seeds the layout so the
 *  scrollbar lands close to the right place on first render. */
const ROW_HEIGHT_ESTIMATE = 32;
/** Renders this many rows above/below the viewport so quick scrolls
 *  do not flash empty space. */
const OVERSCAN = 12;

function isNumeric(cell: ColumnValue): boolean {
  return cell.type === 'integer' || cell.type === 'float';
}

/** Per-type cell rendering: nulls italic-subtle, numbers right-aligned
 *  tabular, booleans pill-coded, blobs warning-tinted hex preview. */
function CellContent({ cell }: { cell: ColumnValue }) {
  switch (cell.type) {
    case 'null':
      return <span className="italic text-fg-subtle">NULL</span>;
    case 'text':
      return <>{cell.value}</>;
    case 'integer':
    case 'float':
      return <span className="tabular-nums">{cell.value}</span>;
    case 'bool':
      return (
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            cell.value
              ? 'bg-success-subtle text-success'
              : 'bg-danger-subtle text-danger'
          }`}
        >
          {cell.value ? 'true' : 'false'}
        </span>
      );
    case 'blob': {
      const preview = cell.value.slice(0, 16);
      const truncated = cell.value.length > 16;
      return (
        <span className="inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-0.5 font-mono text-[10px] text-warning">
          <span className="font-semibold">BLOB</span>
          <span>
            0x{preview}
            {truncated ? '…' : ''}
          </span>
        </span>
      );
    }
  }
}

/**
 * Virtualised render of a `QueryResult`.
 *
 * Affected-row results render inline; row results render through a
 * sticky-header table backed by `@tanstack/react-virtual`, so multi-
 * thousand-row result sets stay smooth without flooding the DOM.
 */
export function ResultTable({ result, height = 480 }: ResultTableProps) {
  if ('Affected' in result) {
    const n = result.Affected.rows;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success-subtle">
          <CheckCircle2 className="h-4 w-4 text-success" />
        </div>
        <div className="text-sm text-fg-muted">
          <span className="font-mono font-semibold text-fg">{n.toLocaleString()}</span>{' '}
          row{n === 1 ? '' : 's'} affected
        </div>
      </div>
    );
  }

  const { columns, rows } = result.Rows;
  return <VirtualRows columns={columns} rows={rows} height={height} />;
}

interface VirtualRowsProps {
  columns: { name: string }[];
  rows: { cells: ColumnValue[] }[];
  height: number;
}

function VirtualRows({ columns, rows, height }: VirtualRowsProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = totalSize - (items.at(-1)?.end ?? 0);

  const firstRow = rows[0];
  const columnIsNumeric = columns.map((_, i) => {
    if (!firstRow) return false;
    const cell = firstRow.cells[i];
    return cell ? isNumeric(cell) : false;
  });

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge bg-panel px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Database className="h-3.5 w-3.5 text-fg-subtle" />
          <span>
            <span className="font-mono font-semibold text-fg">
              {rows.length.toLocaleString()}
            </span>{' '}
            row{rows.length === 1 ? '' : 's'}
          </span>
          <span className="text-fg-subtle">·</span>
          <span>
            <span className="font-mono font-semibold text-fg">{columns.length}</span>{' '}
            column{columns.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-canvas px-6 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated">
            <Inbox className="h-6 w-6 text-fg-subtle" />
          </div>
          <p className="mb-1 text-sm font-medium text-fg-muted">No rows returned</p>
          <p className="text-xs text-fg-subtle">Query succeeded but matched zero rows.</p>
        </div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-auto bg-canvas"
          style={{ height: `${height}px`, contain: 'strict' }}
        >
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-panel text-left text-[11px] uppercase tracking-wide text-fg-muted shadow-[0_1px_0_0_var(--color-edge)]">
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.name}
                    className={`whitespace-nowrap px-3 py-2 font-mono font-semibold ${
                      columnIsNumeric[i] ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr aria-hidden style={{ height: `${paddingTop}px` }}>
                  <td colSpan={columns.length} />
                </tr>
              )}
              {items.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <tr
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={`border-b border-edge-subtle transition-colors hover:bg-[var(--color-row-hover)] ${
                      virtualRow.index % 2 === 0 ? 'bg-canvas' : 'bg-[var(--color-row-alt)]'
                    }`}
                  >
                    {row.cells.map((cell, j) => (
                      <td
                        key={j}
                        className={`whitespace-nowrap px-3 py-1.5 font-mono text-xs text-fg ${
                          isNumeric(cell) ? 'text-right' : 'text-left'
                        }`}
                      >
                        <CellContent cell={cell} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden style={{ height: `${paddingBottom}px` }}>
                  <td colSpan={columns.length} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
