import { renderCell, type QueryResult } from './types';

export interface ResultTableProps {
  result: QueryResult;
}

/**
 * Renders a [`QueryResult`] as either an affected-row count or a plain
 * HTML table. Pagination, sticky headers, and column resizing land later
 * with the TanStack Table integration.
 */
export function ResultTable({ result }: ResultTableProps) {
  if ('Affected' in result) {
    return (
      <div className="rounded border border-zinc-800 p-3 text-sm text-zinc-300">
        Affected rows: <span className="font-mono">{result.Affected.rows}</span>
      </div>
    );
  }

  const { columns, rows } = result.Rows;
  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-900 text-left text-xs uppercase text-zinc-400">
          <tr>
            {columns.map((col) => (
              <th key={col.name} className="px-3 py-2 font-medium">
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-zinc-950 even:bg-zinc-900/50">
              {row.cells.map((cell, j) => (
                <td key={j} className="px-3 py-2 font-mono text-xs text-zinc-200">
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
