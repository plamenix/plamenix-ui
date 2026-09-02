import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type WheelEvent,
} from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { ToolbarSlot } from '../toolbar/ToolbarSlot';
import type { TabState } from './tabs-store';

/** Per-button ctx the `tabstrip` toolbar slot hands plugins. */
interface TabStripToolbarCtx {
  activeTabId: string;
}

export interface TabStripProps {
  tabs: TabState[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  /** Optional drag-to-reorder handler. When omitted, drag is disabled. */
  onReorder?: (from: number, to: number) => void;
  /** Optional map of tabId → CSS color (hex). When provided, the
   *  connected-state status dot is tinted with the tab's profile colour
   *  so users can distinguish dev/staging/prod tabs at a glance. */
  accentByTabId?: Record<string, string>;
}

/**
 * Top-of-window tab strip. Renders one button per tab plus a `+`
 * affordance. Tabs visualise three signals:
 *  - connection status: accent dot when a session is attached
 *  - dirty buffer: hollow dot when the SQL buffer has diverged from
 *    what produced the current result (only when a session is open)
 *  - active tab: lifted background, accent top-bar
 *
 * When `onReorder` is supplied, tabs are draggable and re-order
 * through native HTML5 drag and drop.
 */
export function TabStrip({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
  onReorder,
  accentByTabId,
}: TabStripProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /** Horizontal-overflow state for the scrollable tab row. Drives the
   *  chevron buttons that nudge the row left / right when more tabs
   *  exist than fit the available width (e.g. tabs pushed behind the
   *  Home button / app menu on the right). */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setOverflow({
        left: el.scrollLeft > 0,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [tabs.length]);

  // Vertical wheel → horizontal scroll. Trackpads already deliver
  // `deltaX`; the conversion only kicks in for mice with a single
  // vertical wheel so dragging across the tab row feels native there
  // too.
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const nudge = (dir: 1 | -1) => () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const handleDragStart = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };

  const handleDragOver = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== i) setOverIndex(i);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setOverIndex(null);
  };

  const handleDrop = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== i && onReorder) {
      onReorder(dragIndex, i);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div
      role="tablist"
      aria-label="Sessions"
      className="flex shrink-0 items-end bg-inset pl-1 pr-2 pt-2.5"
    >
      {/* + New tab anchored on the far left so it never gets clipped
          when the tab row overflows behind the Home button / menu on
          the right. */}
      <button
        type="button"
        onClick={onNew}
        aria-label="New tab"
        title="New tab"
        className="mb-px mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-panel hover:text-fg"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {overflow.left && (
        <button
          type="button"
          onClick={nudge(-1)}
          aria-label="Scroll tabs left"
          title="More tabs"
          className="mb-px mr-1 flex h-7 w-5 shrink-0 items-center justify-center rounded-md bg-panel/80 text-fg-subtle shadow-sm transition-colors hover:bg-panel hover:text-fg"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t, i) => (
          <TabButton
            key={t.id}
            tab={t}
            index={i}
            active={t.id === activeTabId}
            draggable={onReorder !== undefined}
            dragging={dragIndex === i}
            dropTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
            onSelect={() => onSelect(t.id)}
            onClose={() => onClose(t.id)}
            onDragStart={handleDragStart(i)}
            onDragOver={handleDragOver(i)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop(i)}
            onDragEnd={handleDragEnd}
            accentColor={accentByTabId?.[t.id]}
          />
        ))}
        {/* I5.3 — plugin-contributed tab-strip toolbar buttons live
            inside the scrolling row so they scroll with the tabs they
            decorate. */}
        <ToolbarSlot<TabStripToolbarCtx>
          location="tabstrip"
          ctx={{ activeTabId }}
        />
      </div>
      {overflow.right && (
        <button
          type="button"
          onClick={nudge(1)}
          aria-label="Scroll tabs right"
          title="More tabs"
          className="mb-px ml-1 flex h-7 w-5 shrink-0 items-center justify-center rounded-md bg-panel/80 text-fg-subtle shadow-sm transition-colors hover:bg-panel hover:text-fg"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface TabButtonProps {
  tab: TabState;
  index: number;
  active: boolean;
  draggable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  accentColor?: string | undefined;
  onSelect: () => void;
  onClose: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function TabButton({
  tab,
  index,
  active,
  draggable,
  dragging,
  dropTarget,
  accentColor,
  onSelect,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: TabButtonProps) {
  const connected = tab.sessionId !== null;
  const dirty = connected && tab.executedSql !== null && tab.sql !== tab.executedSql;
  const fresh = connected && tab.executedSql === null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const skin = active
    ? 'border-edge border-b-transparent bg-panel text-fg'
    : 'border-transparent text-fg-muted hover:bg-panel/60 hover:text-fg';

  return (
    <div
      role="tab"
      aria-selected={active}
      aria-controls={`tabpanel-${tab.id}`}
      data-index={index}
      tabIndex={0}
      draggable={draggable}
      onClick={onSelect}
      onKeyDown={onKey}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative flex cursor-pointer select-none items-center gap-1.5 rounded-t-md border border-b-0 pl-3 pr-2 py-2 text-xs transition-colors ${skin} ${dragging ? 'opacity-50' : ''} ${dropTarget ? 'ring-2 ring-accent ring-offset-0' : ''}`}
      title={tab.title}
    >
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-0 h-[2px] rounded-full bg-accent"
        />
      )}

      <StatusDot
        connected={connected}
        dirty={dirty}
        fresh={fresh}
        health={tab.health}
        accentColor={accentColor}
      />

      <span className="max-w-[14rem] truncate font-medium">{tab.title}</span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${tab.title}`}
        title="Close"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-elevated hover:text-danger ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function StatusDot({
  connected,
  dirty,
  fresh,
  health,
  accentColor,
}: {
  connected: boolean;
  dirty: boolean;
  fresh: boolean;
  health: TabState['health'];
  accentColor?: string | undefined;
}) {
  if (!connected) {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full bg-fg-subtle/40"
        title="Disconnected"
      />
    );
  }
  if (health === 'dead') {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full bg-danger"
        title="Connection lost — click the tab to reconnect"
      />
    );
  }
  if (health === 'reconnecting') {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning"
        title="Reconnecting…"
      />
    );
  }
  if (dirty) {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full border bg-transparent"
        style={{ borderColor: accentColor ?? 'var(--color-warning)' }}
        title="Buffer modified since last execute"
      />
    );
  }
  if (fresh) {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: accentColor ?? 'var(--color-accent)' }}
        title="Connected — no query yet"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: accentColor ?? 'var(--color-success)' }}
      title="Connected"
    />
  );
}
