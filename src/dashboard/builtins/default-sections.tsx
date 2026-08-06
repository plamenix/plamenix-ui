/**
 * Built-in dashboard sections (I5.10) — extracts the four legacy
 * Welcome cards (Connection info / Entity counts / Tips / Recent
 * queries) into `dashboard_sections` contributions registered under
 * `@plamenix-builtin/dashboard-default-sections`.
 *
 * Each card is a self-contained Component that reads from the shell-
 * supplied `DashboardContext` plus any stores it needs. The Components
 * re-use the helper primitives (`InfoCell`, `CountCell`, `TipsCard`,
 * `previewSql`, `formatRelative`, `stemOf`, `countsFromSchema`)
 * exported from `WelcomeDashboard.tsx` so the markup matches the
 * pre-I5.10 layout pixel-for-pixel.
 *
 * Priority spacing 200/210/220/230 preserves the legacy display
 * order (Connection → Entities → Tips → Recent). Registry default
 * is 100, so third-party dashboard cards (Active sessions / Lock
 * waits / Cache hit ratio / etc.) sort above the built-ins by
 * default — community-extends-shell convention.
 */

import { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  Fingerprint,
  History as HistoryIcon,
  Lightbulb,
  Network,
  Sparkles,
  Tag,
  User as UserIcon,
  XCircle,
  Zap,
} from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import {
  CountCell,
  InfoCell,
  TipsCard,
  countsFromSchema,
  formatRelative,
  previewSql,
  stemOf,
} from '../../db/WelcomeDashboard.js';
import { useDisplayStore } from '../../db/display-store.js';
import { selectRecent, useRecentQueries } from '../../db/recent-queries.js';
import { SqlHighlight } from '../../db/SqlHighlight.js';
import type {
  DashboardContext,
  DashboardSectionContributionPayload,
} from '../dashboard-section-contract.js';

const BUILTIN_NAME = 'dashboard-default-sections';

/** Connection-info section — six InfoCells in a responsive grid. */
function BuiltinConnectionInfoCard({ ctx }: { ctx: DashboardContext }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const connectedLabel =
    ctx.connectedAt !== null && ctx.connectedAt !== undefined
      ? formatRelative(ctx.connectedAt, tick)
      : null;
  const dbStem = stemOf(ctx.database ?? '');
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-fg" title={dbStem}>
            Welcome to {dbStem}
          </h2>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            Run a query to populate this tab. Connection details below.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <InfoCell icon={UserIcon} label="User" value={ctx.user || '—'} />
        <InfoCell
          icon={Zap}
          label="Engine"
          value={ctx.engineVersion ? `Firebird ${ctx.engineVersion}` : 'Firebird (probing…)'}
        />
        <InfoCell icon={Network} label="Host" value={`${ctx.host ?? '—'}:${ctx.port ?? '—'}`} />
        <InfoCell
          icon={Database}
          label="Database"
          value={ctx.database ?? '—'}
          mono
          title={ctx.database}
        />
        <InfoCell
          icon={Fingerprint}
          label="Session"
          value={ctx.sessionId ?? '—'}
          mono
          title={ctx.sessionId ?? undefined}
        />
        <InfoCell
          icon={Activity}
          label="Connected"
          value={connectedLabel ?? '—'}
          title={
            ctx.connectedAt !== null && ctx.connectedAt !== undefined
              ? new Date(ctx.connectedAt).toLocaleString()
              : undefined
          }
        />
      </div>
    </section>
  );
}

/** Entity-counts section — six CountCells (Tables / Views / Procs / Triggers / Generators / Domains). */
function BuiltinEntityCountsCard({ ctx }: { ctx: DashboardContext }) {
  const counts = countsFromSchema(ctx.schema ?? null);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        <Tag className="h-3 w-3" /> Entity counts
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <CountCell label="Tables" value={counts.tables} />
        <CountCell label="Views" value={counts.views} />
        <CountCell label="Procedures" value={counts.procedures} />
        <CountCell label="Triggers" value={counts.triggers} />
        <CountCell label="Generators" value={counts.generators} />
        <CountCell label="Domains" value={counts.domains} />
      </div>
    </section>
  );
}

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
  // Connection-info + entity-counts cards have moved into the
  // top-level WelcomeDashboard hero + KPI tiles. Only Tips + Recent
  // queries remain as registry sections.
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
 * Registers the four built-in Welcome cards. Returns a teardown
 * closure for `useEffect` pairing.
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
