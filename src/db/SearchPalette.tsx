import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Hash,
  KeyRound,
  Search,
  Shapes,
  Table as TableIcon,
  TerminalSquare,
  View,
  Zap,
} from 'lucide-react';
import type { Schema } from './types';

/** Kinds of schema objects the palette surfaces. */
export type SearchHitKind =
  | 'table'
  | 'view'
  | 'column'
  | 'procedure'
  | 'trigger'
  | 'generator'
  | 'domain';

/** One flat result row. The host receives `identifier` (the bare
 *  name, dot-qualified for columns) and inserts it into the editor. */
export interface SearchHit {
  kind: SearchHitKind;
  label: string;
  identifier: string;
  /** Optional second-line context, e.g. `VARCHAR(50)` for a column or
   *  the parent relation for a trigger. */
  hint?: string | undefined;
}

export interface SearchPaletteProps {
  open: boolean;
  /** Active session schema; null while nothing is connected. The
   *  palette quietly hides when the schema is empty or missing. */
  schema?: Schema | null;
  onClose: () => void;
  /** Called when the user picks a hit; receives the bare identifier
   *  the host should drop into the SQL editor. */
  onPick: (identifier: string) => void;
}

/**
 * `⌘⇧F` / `Ctrl+Shift+F` global wildcard search across the active
 * schema.
 *
 * Indexes every relation, column, view, procedure, trigger, generator,
 * and domain into a flat list, then filters by case-insensitive
 * substring on `label`. Results group by kind in the same order the
 * schema browser uses. Arrow-keys + Enter run the highlighted hit;
 * Escape closes the palette.
 *
 * The palette never executes SQL — it just hands the identifier back
 * to the host so the editor can insert it at the caret.
 */
export function SearchPalette({ open, schema = null, onClose, onPick }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const hits = useMemo(() => indexSchema(schema), [schema]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hits;
    return hits.filter(
      (h) =>
        h.label.toLowerCase().includes(q) ||
        h.hint?.toLowerCase().includes(q),
    );
  }, [hits, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlighted(0);
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickAt = (i: number) => {
    const hit = filtered[i];
    if (!hit) return;
    onPick(hit.identifier);
    onClose();
  };

  const handleInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickAt(highlighted);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Search schema"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] flex max-h-[80vh] w-[min(40rem,94vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKey}
            placeholder="Search tables, columns, procedures, triggers, generators, domains…"
            className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          {filtered.length > 0 && (
            <span className="font-mono text-[10px] text-fg-subtle">
              {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-fg-subtle">
              {hits.length === 0
                ? 'No schema loaded yet — connect to a database first.'
                : 'No matches.'}
            </p>
          ) : (
            <ResultsList
              filtered={filtered}
              highlighted={highlighted}
              onHover={setHighlighted}
              onPick={pickAt}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsList({
  filtered,
  highlighted,
  onHover,
  onPick,
}: {
  filtered: SearchHit[];
  highlighted: number;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}) {
  const grouped: { kind: SearchHitKind; items: { hit: SearchHit; flatIdx: number }[] }[] =
    [];
  filtered.forEach((hit, idx) => {
    const last = grouped[grouped.length - 1];
    if (last && last.kind === hit.kind) {
      last.items.push({ hit, flatIdx: idx });
    } else {
      grouped.push({ kind: hit.kind, items: [{ hit, flatIdx: idx }] });
    }
  });
  return (
    <ul className="py-1">
      {grouped.map((group) => (
        <li key={group.kind}>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
            {KIND_LABEL[group.kind]}
          </div>
          <ul>
            {group.items.map(({ hit, flatIdx }) => (
              <li key={flatIdx}>
                <button
                  type="button"
                  onMouseEnter={() => onHover(flatIdx)}
                  onClick={() => onPick(flatIdx)}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left ${
                    flatIdx === highlighted ? 'bg-elevated' : ''
                  }`}
                >
                  <KindIcon kind={hit.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px] text-fg">
                      {hit.label}
                    </div>
                    {hit.hint && (
                      <div className="truncate text-[10px] text-fg-subtle">
                        {hit.hint}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const KIND_LABEL: Record<SearchHitKind, string> = {
  table: 'Tables',
  view: 'Views',
  column: 'Columns',
  procedure: 'Procedures',
  trigger: 'Triggers',
  generator: 'Generators',
  domain: 'Domains',
};

const KIND_ICON: Record<SearchHitKind, ComponentType<{ className?: string }>> = {
  table: TableIcon,
  view: View,
  column: KeyRound,
  procedure: TerminalSquare,
  trigger: Zap,
  generator: Hash,
  domain: Shapes,
};

function KindIcon({ kind }: { kind: SearchHitKind }) {
  const Icon = KIND_ICON[kind];
  return <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />;
}

/** Flattens the schema into a single searchable list. Order matches
 *  `KIND_LABEL` so consecutive results in the same kind cluster. */
function indexSchema(schema: Schema | null): SearchHit[] {
  if (!schema) return [];
  const hits: SearchHit[] = [];
  for (const t of schema.tables) {
    if (t.kind === 'view') {
      hits.push({ kind: 'view', label: t.name, identifier: t.name });
    } else {
      hits.push({ kind: 'table', label: t.name, identifier: t.name });
    }
  }
  for (const t of schema.tables) {
    for (const c of t.columns) {
      hits.push({
        kind: 'column',
        label: `${t.name}.${c.name}`,
        identifier: `${t.name}.${c.name}`,
        hint: `${c.sqlType}${c.nullable ? '' : ' NOT NULL'}`,
      });
    }
  }
  for (const p of schema.procedures ?? []) {
    hits.push({
      kind: 'procedure',
      label: p.name,
      identifier: p.name,
      hint: `IN ${p.inputCount} · OUT ${p.outputCount}`,
    });
  }
  for (const t of schema.triggers ?? []) {
    hits.push({
      kind: 'trigger',
      label: t.name,
      identifier: t.name,
      hint: t.relation || undefined,
    });
  }
  for (const g of schema.generators ?? []) {
    hits.push({ kind: 'generator', label: g.name, identifier: g.name });
  }
  for (const d of schema.domains ?? []) {
    hits.push({
      kind: 'domain',
      label: d.name,
      identifier: d.name,
      hint: d.sqlType,
    });
  }
  return hits;
}
