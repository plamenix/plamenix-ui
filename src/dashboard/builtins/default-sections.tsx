/**
 * Built-in dashboard sections (I5.10) — extracts the Tips and Recent
 * queries Welcome cards into `dashboard_sections` contributions
 * registered under `@plamenix-builtin/dashboard-default-sections`.
 *
 * Connection info and entity counts are deliberately not here: they
 * live in `WelcomeDashboard`'s own hero and KPI pills, which read the
 * live `DatabaseStats` feed rather than the section registry.
 *
 * Each card is a self-contained Component that reads from the shell-
 * supplied `DashboardContext` plus any stores it needs. The Components
 * re-use the helper primitives (`TipsCard`, `previewSql`,
 * `formatRelative`) exported from `WelcomeDashboard.tsx` so the markup
 * matches the pre-I5.10 layout pixel-for-pixel.
 *
 * Priority spacing 220/230 preserves the legacy display order (Tips →
 * Recent). Registry default is 100, so third-party dashboard cards
 * (Active sessions / Lock waits / Cache hit ratio / etc.) sort above
 * the built-ins by default — community-extends-shell convention.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, History as HistoryIcon, Lightbulb, XCircle } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { TipsCard, formatRelative, previewSql } from '../../db/WelcomeDashboard.js';
import { useDisplayStore } from '../../db/display-store.js';
import { selectRecent, useRecentQueries } from '../../db/recent-queries.js';
import { SqlHighlight } from '../../db/SqlHighlight.js';
import type {
  DashboardContext,
  DashboardSectionContributionPayload,
} from '../dashboard-section-contract.js';

const BUILTIN_NAME = 'dashboard-default-sections';

/** Tips section — gated on the `useDisplayStore.showWelcomeTips` flag.
 *  Renders nothing when the user has hidden tips so it doesn't take a
 *  full row of vertical space. */
function BuiltinTipsCard({ ctx }: { ctx: DashboardContext }) {
  const showWelcomeTips = useDisplayStore((s) => s.showWelcomeTips);
  if (!showWelcomeTips) return null;
  return <TipsCard engineVersion={ctx.engineVersion ?? null} />;
}

/** Recent-queries section — surfaces the top 5 entries from the
 *  per-profile recent-queries bucket. Empty state nudges the user
 *  to run a statement; entries are clickable to paste back into the
 *  editor via `ctx.onPickRecent`. */
function BuiltinRecentQueriesCard({ ctx }: { ctx: DashboardContext }) {
  const recent = useRecentQueries((s) => selectRecent(s, ctx.recentKey ?? ''));
  const recentTop = recent.slice(0, 5);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const onPick = ctx.onPickRecent;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        <HistoryIcon className="h-3 w-3" /> Recent queries
      </h3>
      {recentTop.length === 0 ? (
        <p className="rounded-md border border-dashed border-edge bg-canvas px-3 py-3 text-center text-[11px] text-fg-subtle">
          Run a statement and recent executions will appear here.
        </p>
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge bg-canvas">
          {recentTop.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onPick?.(entry.sql)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-elevated"
              >
                {entry.status === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                )}
                <div className="min-w-0 flex-1">
                  {entry.label && (
                    <span className="mb-0.5 inline-block rounded bg-accent-subtle px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-accent">
                      {entry.label}
                    </span>
                  )}
                  <div className="overflow-hidden text-[12px] text-fg">
                    <SqlHighlight value={previewSql(entry.sql)} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-fg-subtle">
                    <span>{formatRelative(entry.executedAt, tick)}</span>
                    <span className="font-mono">{entry.durationMs.toLocaleString()} ms</span>
                    {entry.status === 'ok' && entry.rowCount !== null && (
                      <span className="font-mono">
                        {entry.rowCount.toLocaleString()} row
                        {entry.rowCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {entry.status === 'err' && entry.error && (
                      <span className="truncate text-danger">{entry.error}</span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SECTIONS: {
  id: string;
  priority: number;
  payload: DashboardSectionContributionPayload;
}[] = [
  {
    id: 'tips',
    priority: 220,
    payload: { title: 'Tips', icon: Lightbulb, Component: BuiltinTipsCard },
  },
  {
    id: 'recent-queries',
    priority: 230,
    payload: { title: 'Recent queries', icon: HistoryIcon, Component: BuiltinRecentQueriesCard },
  },
];

/**
 * Registers the built-in Welcome cards. Returns a teardown closure for
 * `useEffect` pairing.
 */
export function registerBuiltinDefaultDashboardSections(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    dashboard_sections: SECTIONS,
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinDefaultDashboardSections(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
