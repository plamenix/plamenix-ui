/**
 * Keyboard-shortcut cheat sheet. Modal overlay listing every shortcut
 * the user can reach, grouped by area. Pure data — no runtime state to
 * wire; host owns the `open` flag and `?` keypress binding.
 *
 * Mac users see `⌘` / `⇧` / `⌥` glyphs; everyone else sees `Ctrl` /
 * `Shift` / `Alt`. The platform helper in `../platform.ts` resolves
 * the right tokens at render time.
 */

import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import {
  getModKeyLabel,
  getShiftKeyLabel,
} from '../platform';

export interface ShortcutsCheatSheetProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
  /** Optional condition surfaced in faint text after the description
   *  — e.g. "in editor" / "when disconnected". Keep these one-line. */
  context?: string;
}

interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

function buildGroups(): ShortcutGroup[] {
  const mod = getModKeyLabel();
  const shift = getShiftKeyLabel();
  return [
    {
      title: 'Editor',
      entries: [
        { keys: [`${mod}+Enter`], description: 'Run SQL', context: 'when toggle on' },
        {
          keys: [`${mod}+${shift}+0…9`],
          description: 'Set bookmark at caret (slot 0–9)',
        },
        { keys: [`${mod}+0…9`], description: 'Jump to bookmark slot' },
        { keys: ['Tab', `${shift}+Tab`], description: 'Indent / outdent selection' },
        { keys: [`${mod}+/`], description: 'Toggle line comment (--)' },
        { keys: [`${mod}+Z`, `${mod}+${shift}+Z`], description: 'Undo / redo' },
      ],
    },
    {
      title: 'Navigation',
      entries: [
        { keys: [`${mod}+K`], description: 'Command palette' },
        { keys: [`${mod}+${shift}+F`], description: 'Search schema (tables, columns, …)' },
        { keys: [`${mod}+T`], description: 'New tab' },
        { keys: [`${mod}+W`], description: 'Close active tab' },
        {
          keys: [`${mod}+S`],
          description: 'Save connection profile',
          context: 'on connection screen',
        },
      ],
    },
    {
      title: 'Results',
      entries: [
        { keys: ['Double-click cell'], description: 'Edit value inline' },
        { keys: ['Click column header'], description: 'Sort by column' },
        { keys: ['Drag column edge'], description: 'Resize column' },
        { keys: ['Click filter icon'], description: 'Open column filter popover' },
        { keys: ['Enter'], description: 'Commit cell edit / jump to page' },
        { keys: ['Esc'], description: 'Cancel inline edit' },
      ],
    },
    {
      title: 'Schema',
      entries: [
        {
          keys: ['Drag identifier → editor'],
          description: 'Insert table / column name at caret',
        },
        {
          keys: ['Hover row'],
          description: 'Reveal Drop / Eye / Power buttons',
        },
        { keys: ['Click section header'], description: 'Collapse / expand section' },
      ],
    },
    {
      title: 'Misc',
      entries: [
        { keys: ['Esc'], description: 'Close any open modal or popover' },
        { keys: ['?'], description: 'Show this cheat sheet' },
      ],
    },
  ];
}

/** Two-column modal listing every Plamenix shortcut. ESC closes;
 *  backdrop click closes. The grid keeps groups balanced across the
 *  two columns so the dialog stays compact on smaller windows. */
export function ShortcutsCheatSheet({ open, onClose }: ShortcutsCheatSheetProps) {
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
  const groups = buildGroups();

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] flex max-h-[80vh] w-[min(44rem,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-4 py-2.5">
          <Keyboard className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">Keyboard shortcuts</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.entries.map((entry, idx) => (
                  <div
                    key={`${group.title}-${idx}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <dt className="flex shrink-0 flex-wrap items-center gap-1">
                      {entry.keys.map((key, ki) => (
                        <kbd
                          key={ki}
                          className="rounded border border-edge bg-canvas px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dt>
                    <dd className="min-w-0 flex-1 text-right text-[11px] text-fg-muted">
                      {entry.description}
                      {entry.context && (
                        <span className="ml-1 text-fg-subtle">· {entry.context}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <footer className="border-t border-edge bg-canvas px-4 py-2 text-[10px] text-fg-subtle">
          Press <kbd className="rounded border border-edge bg-panel px-1 py-0.5 font-mono">Esc</kbd> to close.
        </footer>
      </div>
    </div>
  );
}
