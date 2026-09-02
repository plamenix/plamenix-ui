/**
 * Top-bar History button. Mirrors [`HomeButton`]'s shape and sits
 * beside it, because History is a destination in the same sense Home is
 * — a view the shell switches to, not a modal it raises over the top.
 *
 * Query history existed long before this button did; it was reachable
 * only by keyboard shortcut, which meant that in practice it was
 * reachable only by someone who already knew it was there. Nothing in
 * the interface said so, and it was not in the app menu either.
 */

import { History } from 'lucide-react';

export interface HistoryButtonProps {
  onClick: () => void;
  /** Optional aria + title override. Default `"History"`. */
  title?: string;
  /** When `true`, render the button in its "you are here" state — the
   *  history view is the active pane. The shell computes this from the
   *  same predicate it uses to decide which pane to render. */
  active?: boolean;
}

export function HistoryButton({ onClick, title = 'History', active = false }: HistoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      title={title}
      className={
        'relative flex self-stretch items-center gap-1.5 whitespace-nowrap px-3 text-xs font-medium transition-colors ' +
        (active ? 'bg-panel text-fg' : 'text-fg-subtle hover:bg-panel hover:text-fg')
      }
    >
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent"
        />
      )}
      <History className="h-3.5 w-3.5" />
      <span>History</span>
    </button>
  );
}
