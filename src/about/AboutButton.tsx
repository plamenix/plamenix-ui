/**
 * Top-bar button that opens the [`AboutPage`]. Mirrors
 * [`PluginsButton`] and [`SettingsButton`] for visual consistency.
 */

import { Info } from 'lucide-react';

export interface AboutButtonProps {
  /** Called when the user clicks the button. */
  onClick: () => void;
  /** Tooltip + aria-label override. Default `"About"`. */
  title?: string;
}

export function AboutButton({ onClick, title = 'About' }: AboutButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className="relative flex self-stretch items-center gap-1.5 px-3 text-xs font-medium text-fg-subtle transition-colors hover:bg-panel hover:text-fg"
    >
      <Info className="h-3.5 w-3.5" />
      <span>About</span>
    </button>
  );
}
