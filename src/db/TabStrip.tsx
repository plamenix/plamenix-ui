import type { TabState } from './tabs-store';

export interface TabStripProps {
  tabs: TabState[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

/**
 * Top-of-window tab strip. Renders one button per tab plus a `+`
 * affordance. Tabs with an open session show a small dot next to
 * their title.
 */
export function TabStrip({ tabs, activeTabId, onSelect, onClose, onNew }: TabStripProps) {
  return (
    <div className="flex shrink-0 items-end gap-1 border-b border-zinc-800 bg-zinc-950 px-2 pt-1">
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          tab={t}
          active={t.id === activeTabId}
          onSelect={() => onSelect(t.id)}
          onClose={() => onClose(t.id)}
        />
      ))}
      <button
        type="button"
        className="mb-1 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
        onClick={onNew}
        aria-label="New tab"
        title="New tab"
      >
        +
      </button>
    </div>
  );
}

interface TabButtonProps {
  tab: TabState;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function TabButton({ tab, active, onSelect, onClose }: TabButtonProps) {
  const base = 'flex items-center gap-1 rounded-t border border-b-0 px-2 py-1 text-xs';
  const skin = active
    ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
    : 'border-transparent text-zinc-400 hover:bg-zinc-900';
  return (
    <div className={`${base} ${skin}`}>
      <button
        type="button"
        onClick={onSelect}
        className="max-w-[14rem] truncate"
        title={tab.title}
      >
        {tab.sessionId !== null && <span className="mr-1 text-emerald-400">●</span>}
        {tab.title}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="text-zinc-500 hover:text-zinc-200"
        aria-label={`Close ${tab.title}`}
      >
        ×
      </button>
    </div>
  );
}
