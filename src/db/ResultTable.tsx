import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { renderCell, type QueryResult } from './types';

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
const ROW_HEIGHT_ESTIMATE = 28;
/** Renders this many rows above/below the viewport so quick scrolls
 *  do not flash empty space. */
const OVERSCAN = 12;

/**
 * Virtualised render of a `QueryResult`.
 *
 * Affected-row results render inline; row results render through a
 * sticky-header table backed by `@tanstack/react-virtual`, so multi-
 * thousand-row result sets stay smooth without flooding the DOM.
 */
export function ResultTable({ result, height = 480 }: ResultTableProps) {
  if ('Affected' in result) {
    return (
      <div className="rounded border border-edge bg-panel p-3 text-sm text-fg-muted">
        Affected rows: <span className="font-mono text-fg">{result.Affected.rows}</span>
      </div>
    );
  }

  const { columns, rows } = result.Rows;
  return <VirtualRows columns={columns} rows={rows} height={height} />;
}

interface VirtualRowsProps {
  columns: { name: string }[];
  rows: { cells: import('./types').ColumnValue[] }[];
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

  return (
    <div className="rounded border border-edge bg-panel">
      <div className="border-b border-edge bg-panel px-3 py-1 text-xs text-fg-muted">
        {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
      </div>
      <div
        ref={parentRef}
        className="overflow-auto bg-canvas"
        style={{ height: `${height}px`, contain: 'strict' }}
      >
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel text-left text-xs uppercase text-fg-muted shadow-[0_1px_0_0_var(--color-edge)]">
            <tr>
              {columns.map((col) => (
                <th key={col.name} className="px-3 py-2 font-medium whitespace-nowrap">
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
                  className={
                    virtualRow.index % 2 === 0 ? 'bg-canvas' : 'bg-[var(--color-row-alt)]'
                  }
                >
                  {row.cells.map((cell, j) => (
                    <td
                      key={j}
                      className="px-3 py-1.5 font-mono text-xs text-fg whitespace-nowrap"
                    >
                      {renderCell(cell)}
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
    </div>
  );
}
