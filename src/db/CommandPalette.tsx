import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Command as CommandIcon } from 'lucide-react';

/** One executable entry in the command palette. */
export interface Command {
  id: string;
  label: string;
  /** Optional secondary text, rendered smaller under the label. */
  description?: string;
  /** Optional keyboard shortcut hint, rendered as a `<kbd>` on the right. */
  shortcut?: string;
  /** Optional Lucide icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Section heading; consecutive entries with the same group cluster. */
  group?: string;
  /** Fired when the user picks this command. The palette closes after. */
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

/**
 * `Cmd+K` style command palette. Filters commands by case-insensitive
 * substring match against label and description; navigates with the
 * arrow keys; runs the highlighted entry on Enter; closes on Escape or
 * a backdrop click.
 *
 * The palette renders nothing when `open` is false, so it costs no DOM
 * while idle. Wire `open` to a host-owned `Cmd+K` listener.
 */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlighted(0);
    }
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

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  const handleInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(highlighted);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[12vh] w-[min(36rem,90vw)] overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <CommandIcon className="h-4 w-4 text-fg-subtle" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKey}
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <kbd className="rounded border border-edge bg-elevated px-1.5 py-px font-mono text-[10px] text-fg-subtle">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-fg-subtle">
              No commands match{query ? ` "${query}"` : ''}.
            </p>
          ) : (
            renderGrouped(filtered, highlighted, setHighlighted, runAt)
          )}
        </div>
      </div>
    </div>
  );
}

function renderGrouped(
  commands: Command[],
  highlighted: number,
  setHighlighted: (i: number) => void,
  runAt: (i: number) => void,
) {
  const out: React.ReactNode[] = [];
  let lastGroup: string | undefined = undefined;
  commands.forEach((cmd, i) => {
    if (cmd.group !== lastGroup) {
      out.push(
        <div
          key={`group-${cmd.group ?? 'default'}-${i}`}
          className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle"
        >
          {cmd.group ?? 'Commands'}
        </div>,
      );
      lastGroup = cmd.group;
    }
    const Icon = cmd.icon;
    const active = i === highlighted;
    out.push(
      <button
        key={cmd.id}
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={() => setHighlighted(i)}
        onClick={() => runAt(i)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors ${
          active ? 'bg-accent-subtle text-fg' : 'text-fg-muted hover:bg-elevated hover:text-fg'
        }`}
      >
        {Icon && (
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-accent' : 'text-fg-subtle'}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{cmd.label}</div>
          {cmd.description && (
            <div className="truncate text-[10px] text-fg-subtle">{cmd.description}</div>
          )}
        </div>
        {cmd.shortcut && (
          <kbd className="shrink-0 rounded border border-edge bg-elevated px-1.5 py-px font-mono text-[10px] text-fg-subtle">
            {cmd.shortcut}
          </kbd>
        )}
      </button>,
    );
  });
  return out;
}
