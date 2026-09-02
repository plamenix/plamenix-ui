/**
 * Top-bar Home button. Mirrors [`PluginsButton`] / [`SettingsButton`]
 * shape. Click handler is owned by the shell — typical wiring clears
 * `focusedObjectName` + `results` on the active tab so
 * `WelcomeDashboard` re-renders.
 */

import { Home } from 'lucide-react';

export interface HomeButtonProps {
  onClick: () => void;
  /** Optional aria + title override. Default `"Home"`. */
  title?: string;
  /** When `true`, render the button in its "you are here" state — the
   *  Welcome dashboard is the active view. The shell computes this
   *  from the same predicate it uses to decide which pane to render. */
  active?: boolean;
}

export function HomeButton({ onClick, title = 'Home', active = false }: HomeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      title={title}
      className={
        'relative flex self-stretch items-center gap-1.5 px-3 text-xs font-medium transition-colors ' +
        (active
          ? 'bg-panel text-fg'
          : 'text-fg-subtle hover:bg-panel hover:text-fg')
      }
    >
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent"
        />
      )}
      <Home className="h-3.5 w-3.5" />
      <span>Home</span>
    </button>
  );
}
