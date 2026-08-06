/**
 * Top-right hamburger-style menu button. Consolidates Plugins / Settings
 * / About / Statistics / Disconnect into one dropdown so the top bar
 * stays minimal (Home + this menu only).
 *
 * The button itself looks like a Settings gear; the dropdown groups
 * navigation items at the top and any session-only actions (Statistics,
 * Disconnect) at the bottom separated by a divider.
 */

import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ChartLine,
  Info,
  LogOut,
  Plug,
  Settings as SettingsIcon,
} from 'lucide-react';

export interface AppMenuItem {
  /** Stable id used as React key. */
  id: string;
  /** Click handler. The menu closes itself before this fires. */
  onClick: () => void;
  /** Lucide icon component. */
  icon: ComponentType<{ className?: string }>;
  /** Label shown in the menu row. */
  label: string;
  /** Optional badge text (count, "default", etc.). */
  badge?: string;
  /** When `true`, the row renders with danger styling — used by the
   *  Disconnect entry. */
  danger?: boolean;
  /** When `true`, a divider line renders ABOVE this item. */
  dividerAbove?: boolean;
  /** When `true`, the row is rendered greyed-out + inert. */
  disabled?: boolean;
}

export interface AppMenuProps {
  items: AppMenuItem[];
  /** Tooltip + aria-label for the trigger button. Default `"Menu"`. */
  title?: string;
}

export function AppMenu({ items, title = 'Menu' }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex self-stretch items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className="relative flex self-stretch items-center gap-1.5 px-3 text-xs font-medium text-fg-subtle transition-colors hover:bg-panel hover:text-fg"
      >
        <SettingsIcon className="h-3.5 w-3.5" />
        <span>Menu</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={title}
          className="absolute right-0 top-full z-30 mt-1 flex w-56 flex-col rounded-md border border-edge bg-panel text-left shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        >
          <ul className="py-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  {item.dividerAbove && (
                    <div aria-hidden className="my-1 border-t border-edge" />
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.disabled) return;
                      item.onClick();
                      setOpen(false);
                    }}
                    disabled={item.disabled}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors disabled:opacity-50 ${
                      item.danger
                        ? 'text-danger hover:bg-danger-subtle'
                        : 'text-fg hover:bg-elevated'
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        item.danger ? 'text-danger' : 'text-accent'
                      }`}
                    />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`font-mono text-[10px] ${
                          item.danger ? 'text-danger' : 'text-fg-subtle'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export { ChartLine, Info, LogOut, Plug, SettingsIcon };
