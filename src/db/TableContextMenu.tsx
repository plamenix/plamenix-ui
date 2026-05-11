import { useEffect, useRef } from 'react';
import type { TableAction } from './types';

export interface TableContextMenuProps {
  /** Viewport coordinates the menu's top-left anchors at. */
  x: number;
  y: number;
  /** Label shown in the menu header (typically the table name). */
  title: string;
  onAction: (action: TableAction) => void;
  onClose: () => void;
}

interface MenuItem {
  action: TableAction;
  label: string;
  tone?: 'danger';
}

const ITEMS: MenuItem[] = [
  { action: 'alter', label: 'ALTER TABLE…' },
  { action: 'create-index', label: 'CREATE INDEX…' },
  { action: 'drop', label: 'DROP', tone: 'danger' },
];

/**
 * Floating context menu rendered when the user right-clicks a table
 * in the schema browser. Stays dumb: emits an action, the host
 * decides what SQL to put in the editor (or whether to execute
 * immediately, as Drop does).
 */
export function TableContextMenu({ x, y, title, onAction, onClose }: TableContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[10rem] rounded border border-edge bg-elevated py-1 text-xs text-fg shadow-lg"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="border-b border-edge px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
        {title}
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={`block w-full px-3 py-1 text-left hover:bg-panel ${
            item.tone === 'danger' ? 'text-danger' : ''
          }`}
          onClick={() => {
            onAction(item.action);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
