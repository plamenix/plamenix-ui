/**
 * Top-bar button that opens the [`PluginsPage`]. Mirrors the shape of
 * [`SettingsButton`] but surfaces an active-plugin count badge so the
 * user can see at a glance how many plugins the shell loaded.
 *
 * The host owns the click: this component is pure-presentational so
 * shells decide whether the button opens an inline page, a modal, or a
 * detached window. Desktop + web both wire it to the same toggle.
 */

import type { ComponentType } from 'react';
import { Plug } from 'lucide-react';

export interface PluginsButtonProps {
  /** Number of plugins surfaced in the badge. Defaults to `undefined`,
   *  which renders the button without a badge. */
  count?: number;
  /** Called when the user clicks the button. */
  onClick: () => void;
  /** Tooltip + aria-label override. Default `"Plugins"` (with the count
   *  appended when present). */
  title?: string;
  /** Lucide icon override. Default `Plug`. */
  icon?: ComponentType<{ className?: string }>;
}

export function PluginsButton({
  count,
  onClick,
  title,
  icon: Icon = Plug,
}: PluginsButtonProps) {
  const label =
    title ?? (typeof count === 'number' ? `Plugins (${count})` : 'Plugins');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex self-stretch items-center gap-1.5 px-3 text-xs font-medium text-fg-subtle transition-colors hover:bg-panel hover:text-fg"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>Plugins</span>
      {typeof count === 'number' && (
        <span
          aria-hidden
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent/15 px-1.5 py-[1px] font-mono text-[10px] font-semibold text-accent ring-1 ring-inset ring-accent/30"
        >
          {count}
        </span>
      )}
    </button>
  );
}
