import { useEffect, useRef, type ComponentType } from 'react';
import { type LucideIcon } from 'lucide-react';

/** One row in a {@link TableContextMenu}. */
export interface SchemaMenuItem<A extends string = string> {
  /** Opaque action key — the host pattern-matches on this. */
  action: A;
  /** Primary label shown in the menu row. */
  label: string;
  /** Sub-label rendered below the primary text. */
  hint: string;
  icon: ComponentType<{ className?: string }> | LucideIcon;
  /** `danger` rows render red and get a separator above them when they
   *  follow a non-danger row. */
  tone?: 'default' | 'danger';
}

export interface TableContextMenuProps<A extends string = string> {
  /** Viewport coordinates the menu's top-left anchors at. */
  x: number;
  y: number;
  /** Label shown in the menu header (object name or other identifier). */
  title: string;
  /** Optional kind label rendered to the left of the title. */
  kindLabel?: string;
  /** Icon for the menu header (defaults to the kind glyph supplied by
   *  the caller — leaf nodes pass their own icon). */
  headerIcon: ComponentType<{ className?: string }> | LucideIcon;
  /** Menu rows. Order is preserved; a separator is auto-inserted before
   *  the first `danger` row when a `default` row precedes it. */
  items: SchemaMenuItem<A>[];
  onAction: (action: A) => void;
  onClose: () => void;
}

/**
 * Floating context menu rendered on right-click in the schema browser.
 *
 * Generic over the action key type so callers can use a string-literal
 * union for compile-time safety. Stays dumb: emits the chosen action;
 * the host decides what SQL to put in the editor (or whether to execute
 * immediately, as DROP does).
 */
export function TableContextMenu<A extends string>({
  x,
  y,
  title,
  kindLabel,
  headerIcon: HeaderIcon,
  items,
  onAction,
  onClose,
}: TableContextMenuProps<A>) {
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
      className="fixed z-50 min-w-[14rem] overflow-hidden rounded-lg border border-edge bg-panel py-1 text-xs text-fg shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2">
        <HeaderIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        {kindLabel && (
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
            {kindLabel}
          </span>
        )}
        <span
          className="truncate font-mono text-[11px] font-medium text-fg"
          title={title}
        >
          {title}
        </span>
      </div>
      <div className="py-1">
        {items.map((item, i) => {
          const Icon = item.icon;
          const danger = item.tone === 'danger';
          const prevDanger = i > 0 && items[i - 1]!.tone !== 'danger' && danger;
          return (
            <div key={item.action}>
              {prevDanger && <div role="separator" className="my-1 h-px bg-edge" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onAction(item.action);
                  onClose();
                }}
                className={`group flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                  danger
                    ? 'text-danger hover:bg-danger-subtle'
                    : 'text-fg-muted hover:bg-elevated hover:text-fg'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    danger ? 'text-danger' : 'text-fg-subtle group-hover:text-accent'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{item.label}</div>
                  <div
                    className={`text-[10px] ${
                      danger ? 'text-danger/70' : 'text-fg-subtle'
                    }`}
                  >
                    {item.hint}
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
