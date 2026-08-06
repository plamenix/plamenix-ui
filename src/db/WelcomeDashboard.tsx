/**
 * Welcome dashboard — the landing surface for an active session that
 * hasn't run a query yet.
 *
 * Visual hierarchy (top → bottom):
 *   1. Hero — name, identity, health pulse, quick KPIs, quick actions.
 *   2. Schema — donut + top-10 row counts side-by-side.
 *   3. Performance — TX/sec + active statements + attachments sparklines.
 *   4. Recent queries + Tip of the day (side-by-side).
 *   5. Diagnostics strip — compact OIT/OAT/OST + page allocation.
 *
 * Charts are hand-rolled SVG, no new deps. Built-in registry sections
 * (Tips / Recent) are rendered inline by this file with bespoke
 * styling; plugin-contributed `dashboard_sections` still render at the
 * bottom for third-party extensions.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  HardDrive,
  History as HistoryIcon,
  Lightbulb,
  Play,
  Plug,
  RefreshCcw,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pluginContributionsToDashboardSections,
  type DashboardContext,
  type DashboardSectionContributionPayload,
} from '../dashboard/dashboard-section-contract';
import { useDisplayStore } from './display-store';
import { selectRecent, useRecentQueries } from './recent-queries';
import {
  filterTipsForVersion,
  parseEngineMajor,
  type FirebirdTip,
} from './firebird-tips';
import type { DatabaseStats, Schema } from './generated';

export interface WelcomeDashboardProps {
  sessionId: string;
  user: string;
  host: string;
  port: number;
  database: string;
  engineVersion: string | null;
  connectedAt: number | null;
  schema: Schema | null;
  recentKey: string;
  onPickRecent: (sql: string) => void;
  stats?: DatabaseStats | null;
  onRefreshStats?: () => void;
  onComputeRowCounts?: () => Promise<RowCount[]>;
  /** Triggers a schema re-fetch. Wired to the same handler the
   *  SchemaBrowser refresh button uses. */
  onRefreshSchema?: () => void;
  /** Optional clear-editor / new-query callback. Default is to pick a
   *  blank string. */
  onNewQuery?: () => void;
  /** `true` when the session was attached via Firebird's embedded
   *  engine. Hero swaps host:port for an "Embedded" badge + file path
   *  to make the connection mode unambiguous. */
  embedded?: boolean;
}

export interface RowCount {
  name: string;
  kind: 'table' | 'view';
  count: number | null;
  error?: string;
}

interface ActivitySample {
  at: number;
  attachments: number;
  statements: number;
  nextTransaction: number;
}

export function WelcomeDashboard({
  sessionId,
  user,
  host,
  port,
  database,
  engineVersion,
  connectedAt,
  schema,
  recentKey,
  onPickRecent,
  stats = null,
  onRefreshStats,
  onComputeRowCounts,
  onRefreshSchema,
  onNewQuery,
  embedded = false,
}: WelcomeDashboardProps) {
  // Auto-fetch first stats snapshot.
  useEffect(() => {
    if (stats === null && onRefreshStats) onRefreshStats();
  }, [stats, onRefreshStats]);

  // Performance sampling — single 2 s poll feeds Activity charts +
  // Hero KPI pills.
  const [samples, setSamples] = useState<ActivitySample[]>([]);
  // Hold the latest `onRefreshStats` in a ref so the interval below
  // doesn't tear down + recreate on every parent render. Parent
  // typically passes an inline arrow, so the prop identity changes
  // each frame; without this indirection the interval would never
  // fire between cleanup + restart cycles.
  const refreshStatsRef = useRef(onRefreshStats);
  useEffect(() => {
    refreshStatsRef.current = onRefreshStats;
  }, [onRefreshStats]);
  useEffect(() => {
    console.log('[Plamenix] WelcomeDashboard mounted, starting 2s poll');
    const id = window.setInterval(() => {
      const fn = refreshStatsRef.current;
      console.log('[Plamenix] poll tick — has fn:', !!fn);
      if (fn) fn();
    }, 2000);
    return () => {
      console.log('[Plamenix] WelcomeDashboard unmounted, clearing poll');
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!stats) return;
    setSamples((prev) => {
      const next: ActivitySample = {
        at: Date.now(),
        attachments: stats.attachments?.length ?? 0,
        statements: stats.statements?.length ?? 0,
        nextTransaction: Number(stats.database?.nextTransaction ?? 0),
      };
      const merged = [...prev, next];
      return merged.length > 60 ? merged.slice(merged.length - 60) : merged;
    });
  }, [stats]);

  // Row counts — auto-fire on schema land.
  const [rowCountsData, setRowCountsData] = useState<RowCount[] | null>(null);
  const [rowCountsBusy, setRowCountsBusy] = useState(false);
  const [rowCountsError, setRowCountsError] = useState<string | null>(null);
  const runRowCounts = async () => {
    if (!onComputeRowCounts || rowCountsBusy) return;
    setRowCountsBusy(true);
    setRowCountsError(null);
    try {
      const result = await onComputeRowCounts();
      setRowCountsData(result);
    } catch (err) {
      setRowCountsError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowCountsBusy(false);
    }
  };
  useEffect(() => {
    if (!onComputeRowCounts) return;
    if (!schema || schema.tables.length === 0) return;
    if (rowCountsData !== null || rowCountsBusy) return;
    void runRowCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, onComputeRowCounts]);

  // Third-party dashboard sections (built-in Tips + Recent are
  // rendered inline below; we don't register them here so the user
  // gets the bespoke layout, not a generic stack).
  const sectionContributions =
    usePluginContributions<DashboardSectionContributionPayload>('dashboard_sections');
  const externalSections = pluginContributionsToDashboardSections(
    sectionContributions,
  );

  const ctx: DashboardContext = {
    sessionId,
    user,
    host,
    port,
    database,
    engineVersion,
    connectedAt,
    schema,
    recentKey,
    onPickRecent,
  };

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <Hero
        user={user}
        host={host}
        port={port}
        database={database}
        engineVersion={engineVersion}
        connectedAt={connectedAt}
        stats={stats}
        schema={schema}
        samples={samples}
        embedded={embedded}
        onNewQuery={onNewQuery}
        onRefreshSchema={onRefreshSchema}
        onRecountRows={onComputeRowCounts ? runRowCounts : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActiveSessionsPanel stats={stats} />
        <ActiveStatementsPanel stats={stats} />
      </div>

      <PerformanceSection samples={samples} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SchemaSection schema={schema} />
        <SlowestQueriesPanel recentKey={recentKey} onPick={onPickRecent} />
      </div>

      <RowCountsSection
        schema={schema}
        data={rowCountsData}
        busy={rowCountsBusy}
        error={rowCountsError}
        onRecount={onComputeRowCounts ? runRowCounts : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentQueriesPanel ctx={ctx} />
        <TipsPanel engineVersion={engineVersion} />
      </div>

      <DiagnosticsStrip stats={stats} />

      {externalSections.length > 0 && (
        <section className="grid gap-4">
          {externalSections.map((s) => (
            <s.Component key={s.id} ctx={ctx} />
          ))}
        </section>
      )}
    </div>
  );
}

/* ===================== HERO ===================== */

function Hero({
  user,
  host,
  port,
  database,
  engineVersion,
  connectedAt,
  stats,
  schema,
  samples,
  embedded,
  onNewQuery,
  onRefreshSchema,
  onRecountRows,
}: {
  user: string;
  host: string;
  port: number;
  database: string;
  engineVersion: string | null;
  connectedAt: number | null;
  stats: DatabaseStats | null;
  schema: Schema | null;
  samples: ActivitySample[];
  embedded: boolean;
  onNewQuery?: (() => void) | undefined;
  onRefreshSchema?: (() => void) | undefined;
  onRecountRows?: (() => void) | undefined;
}) {
  const dbStem = stemOf(database);
  const sizeBytes =
    stats?.database
      ? Number(stats.database.pages) * Number(stats.database.pageSize)
      : null;
  const last = samples[samples.length - 1];
  const tableCount = schema?.tables.filter((t) => t.kind !== 'view').length ?? 0;
  const viewCount = schema?.tables.filter((t) => t.kind === 'view').length ?? 0;
  const procCount = schema?.procedures?.length ?? 0;
  const triggerCount = schema?.triggers?.length ?? 0;
  const generatorCount = schema?.generators?.length ?? 0;
  const domainCount = schema?.domains?.length ?? 0;
  const connectionUri = embedded
    ? `embedded:${database}`
    : `${user}@${host}:${port}/${database}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connectionUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <header className="relative overflow-hidden rounded-2xl border border-edge bg-gradient-to-br from-panel via-elevated to-panel">
      {/* Decorative accent corner glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="relative grid gap-6 p-6 lg:grid-cols-[auto_1fr_auto] lg:items-start">
        {/* Identity */}
        <div className="flex items-start gap-4">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
            <Database className="h-7 w-7" />
            <HealthDot connected />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-fg" title={database}>
              {dbStem}
            </h1>
            <p
              className="mt-0.5 truncate font-mono text-xs text-fg-muted"
              title={embedded ? database : `${user}@${host}:${port}`}
            >
              {embedded ? database : `${user}@${host}:${port}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {embedded ? (
                <BadgePill icon={HardDrive} tone="accent">
                  Embedded
                </BadgePill>
              ) : (
                <BadgePill icon={Plug} tone="info">
                  Server
                </BadgePill>
              )}
              {engineVersion && (
                <BadgePill icon={Zap} tone="amber">
                  Firebird {engineVersion}
                </BadgePill>
              )}
              <BadgePill icon={Activity} tone="success">
                {connectedAt
                  ? `Connected ${new Date(connectedAt).toLocaleTimeString()}`
                  : 'Connected'}
              </BadgePill>
              <button
                type="button"
                onClick={copy}
                title={copied ? 'Copied!' : 'Copy connection URI'}
                className="inline-flex items-center gap-1 rounded-full border border-edge bg-canvas/60 px-2 py-0.5 font-mono text-[10px] text-fg-subtle transition-colors hover:bg-canvas hover:text-fg"
              >
                {copied ? (
                  <CheckCircle2 className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied ? 'Copied' : 'Copy URI'}
              </button>
            </div>
          </div>
        </div>

        {/* Inline KPI pills */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
          <KpiPill
            label="DB size"
            value={sizeBytes !== null ? humanBytes(sizeBytes) : '—'}
          />
          <KpiPill label="Tables" value={String(tableCount)} />
          <KpiPill label="Views" value={String(viewCount)} />
          <KpiPill
            label="Live stmts"
            value={last ? String(last.statements) : '—'}
            accent
          />
          <KpiPill
            label="Attachments"
            value={last ? String(last.attachments) : '—'}
          />
          <KpiPill
            label="Objects"
            value={String(
              tableCount + viewCount + procCount + triggerCount + generatorCount + domainCount,
            )}
            accent
          />
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
          {onNewQuery && (
            <ActionButton icon={Play} onClick={onNewQuery} primary>
              New query
            </ActionButton>
          )}
          {onRefreshSchema && (
            <ActionButton icon={RefreshCcw} onClick={onRefreshSchema}>
              Refresh schema
            </ActionButton>
          )}
          {onRecountRows && (
            <ActionButton icon={Plug} onClick={onRecountRows}>
              Recount rows
            </ActionButton>
          )}
        </div>
      </div>
    </header>
  );
}

function BadgePill({
  icon: Icon,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'amber' | 'success' | 'accent' | 'info';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'amber'
      ? 'bg-warning/10 text-warning ring-warning/30'
      : tone === 'accent'
        ? 'bg-accent/15 text-accent ring-accent/30'
        : tone === 'info'
          ? 'bg-blue-500/10 text-blue-300 ring-blue-500/30'
          : 'bg-success/10 text-success ring-success/30';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] ring-1 ring-inset ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function HealthDot({ connected }: { connected: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-canvas"
    >
      <span
        className={`relative h-2.5 w-2.5 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`}
      >
        {connected && (
          <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
        )}
      </span>
    </span>
  );
}

function KpiPill({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 ring-1 ring-inset ${
        accent
          ? 'bg-accent/8 ring-accent/25 text-accent'
          : 'bg-canvas/50 ring-edge text-fg'
      }`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="font-mono text-lg font-bold leading-none">{value}</span>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  onClick,
  children,
  primary = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const cls = primary
    ? 'bg-accent text-canvas hover:bg-accent/90 ring-accent/40'
    : 'bg-canvas/50 text-fg-muted hover:bg-canvas hover:text-fg ring-edge';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ring-1 ring-inset ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/* ===================== SCHEMA ===================== */

function SchemaSection({ schema }: { schema: Schema | null }) {
  const segments = useMemo(() => {
    if (!schema) return [];
    const tables = schema.tables.filter((t) => t.kind !== 'view').length;
    const views = schema.tables.filter((t) => t.kind === 'view').length;
    const raw: { label: string; value: number; color: string }[] = [
      { label: 'Tables', value: tables, color: '#f97316' },
      { label: 'Views', value: views, color: '#06b6d4' },
      { label: 'Procedures', value: schema.procedures?.length ?? 0, color: '#22c55e' },
      { label: 'Triggers', value: schema.triggers?.length ?? 0, color: '#3b82f6' },
      { label: 'Generators', value: schema.generators?.length ?? 0, color: '#a855f7' },
      { label: 'Domains', value: schema.domains?.length ?? 0, color: '#eab308' },
    ];
    return raw.filter((s) => s.value > 0);
  }, [schema]);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <Panel
      title="Schema"
      subtitle={total > 0 ? `${total} objects · ${segments.length} kinds` : 'Awaiting schema'}
    >
      {total === 0 ? (
        <EmptyState message="No schema objects to show yet." />
      ) : (
        <div className="flex items-center gap-6">
          <Donut segments={segments} total={total} />
          <ul className="flex-1 grid gap-1.5 text-xs">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-fg-muted">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1">{s.label}</span>
                <span className="font-mono text-fg">{s.value}</span>
                <span className="w-9 text-right font-mono text-[10px] text-fg-subtle">
                  {((s.value / total) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* ===================== ACTIVE SESSIONS ===================== */

function ActiveSessionsPanel({ stats }: { stats: DatabaseStats | null }) {
  const attachments = stats?.attachments ?? [];
  const visible = useMemo(() => {
    const others = attachments.filter((a) => !a.isSelf);
    const self = attachments.find((a) => a.isSelf);
    return self ? [self, ...others] : others;
  }, [attachments]);
  return (
    <Panel
      title="Active sessions"
      subtitle={`${attachments.length} attachment${attachments.length === 1 ? '' : 's'} · MON$ATTACHMENTS`}
    >
      {visible.length === 0 ? (
        <EmptyState message="No active attachments." />
      ) : (
        <ul className="grid gap-1">
          {visible.slice(0, 8).map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-2 rounded-md border border-edge bg-canvas/60 px-3 py-2 text-[11px] ${
                a.isSelf ? 'ring-1 ring-inset ring-accent/30' : ''
              }`}
            >
              <StateBadge state={a.state} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-mono text-fg">
                  {a.user}
                  {a.role && (
                    <span className="rounded bg-elevated px-1 py-px font-mono text-[9px] text-fg-subtle">
                      {a.role}
                    </span>
                  )}
                  {a.isSelf && (
                    <span className="rounded-full bg-accent/15 px-1.5 py-px font-mono text-[9px] text-accent">
                      you
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[10px] text-fg-subtle">
                  {a.remoteProcess || '—'} · {a.remoteAddress || '—'} · {a.characterSet}
                </p>
              </div>
              <span
                className="shrink-0 font-mono text-[10px] text-fg-subtle"
                title={a.timestamp}
              >
                #{a.id}
              </span>
            </li>
          ))}
          {visible.length > 8 && (
            <li className="text-center text-[10px] italic text-fg-subtle">
              … {visible.length - 8} more
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function StateBadge({ state }: { state: number }) {
  const labels = ['idle', 'active', 'stalled'];
  const colors = [
    'bg-fg-subtle/10 text-fg-subtle',
    'bg-success/10 text-success',
    'bg-warning/15 text-warning',
  ];
  const idx = state >= 0 && state <= 2 ? state : 0;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-wide ${colors[idx]}`}
    >
      {labels[idx]}
    </span>
  );
}

/* ===================== ACTIVE STATEMENTS ===================== */

function ActiveStatementsPanel({ stats }: { stats: DatabaseStats | null }) {
  const statements = stats?.statements ?? [];
  // Drop blank-sql + self-monitoring entries — they would dominate the
  // panel with `SELECT … FROM MON$STATEMENTS` from this very query.
  const interesting = useMemo(
    () =>
      statements.filter(
        (s) =>
          s.sqlText.trim().length > 0 &&
          !/MON\$STATEMENTS|MON\$ATTACHMENTS|MON\$DATABASE/i.test(s.sqlText),
      ),
    [statements],
  );
  return (
    <Panel
      title="Active statements"
      subtitle={`${interesting.length} running · MON$STATEMENTS`}
    >
      {interesting.length === 0 ? (
        <EmptyState message="No user statements running right now." />
      ) : (
        <ul className="grid gap-1">
          {interesting.slice(0, 6).map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-edge bg-canvas/60 px-3 py-2 text-[11px]"
            >
              <div className="mb-1 flex items-center gap-2">
                <StateBadge state={s.state} />
                <span className="font-mono text-[10px] text-fg-subtle">
                  stmt #{s.id} · att #{s.attachmentId}
                </span>
                <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                  {new Date(s.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre className="overflow-hidden text-ellipsis whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-fg">
                {previewSql(s.sqlText)}
              </pre>
            </li>
          ))}
          {interesting.length > 6 && (
            <li className="text-center text-[10px] italic text-fg-subtle">
              … {interesting.length - 6} more
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

/* ===================== SLOWEST QUERIES ===================== */

function SlowestQueriesPanel({
  recentKey,
  onPick,
}: {
  recentKey: string;
  onPick: (sql: string) => void;
}) {
  const recent = useRecentQueries((s) => selectRecent(s, recentKey ?? ''));
  const slowest = useMemo(() => {
    return [...recent]
      .filter((r) => r.status === 'ok')
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);
  }, [recent]);
  const slowestMax = slowest[0]?.durationMs ?? 1;
  const totalRuns = recent.length;
  const successCount = recent.filter((r) => r.status === 'ok').length;
  const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;
  return (
    <Panel
      title="Slowest queries"
      subtitle={
        totalRuns === 0
          ? 'No history yet'
          : `${totalRuns} runs · ${successRate.toFixed(0)}% ok`
      }
    >
      {slowest.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          message="Run a successful query — the slowest five surface here."
        />
      ) : (
        <ul className="grid gap-2">
          {slowest.map((q, idx) => {
            const pct = (q.durationMs / slowestMax) * 100;
            return (
              <li key={q.id} className="grid gap-1">
                <button
                  type="button"
                  onClick={() => onPick(q.sql)}
                  className="flex items-baseline gap-2 text-left text-[11px] hover:underline"
                  title="Insert into editor"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-fg-subtle">
                    {idx + 1}.
                  </span>
                  <span
                    className="flex-1 truncate font-mono text-fg-muted hover:text-fg"
                    title={q.sql}
                  >
                    {previewSql(q.sql)}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-warning">
                    {q.durationMs.toLocaleString()} ms
                  </span>
                </button>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-edge/40">
                  <div
                    className="h-full rounded-full bg-warning/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Donut({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  const radius = 56;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      role="img"
      aria-label="Schema breakdown donut chart"
    >
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke="var(--color-edge)"
        strokeWidth={stroke}
      />
      {segments.map((s) => {
        const len = (s.value / total) * circumference;
        const el = (
          <circle
            key={s.label}
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${circumference - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
      <text
        x="70"
        y="68"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-fg font-mono text-[22px] font-bold"
      >
        {total}
      </text>
      <text
        x="70"
        y="88"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-fg-subtle font-mono text-[9px] uppercase tracking-wider"
      >
        Objects
      </text>
    </svg>
  );
}

/* ===================== ROW COUNTS ===================== */

function RowCountsSection({
  schema,
  data,
  busy,
  error,
  onRecount,
}: {
  schema: Schema | null;
  data: RowCount[] | null;
  busy: boolean;
  error: string | null;
  onRecount?: (() => void) | undefined;
}) {
  const total =
    data === null ? null : data.reduce((s, r) => s + (r.count ?? 0), 0);
  const topRows = useMemo(() => {
    if (!data) return [];
    return [...data]
      .filter((r) => r.count !== null)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 10);
  }, [data]);
  const topMax = topRows[0]?.count ?? 1;
  const errors = data?.filter((r) => r.error).length ?? 0;
  const tableCount = schema?.tables.filter((t) => t.kind !== 'view').length ?? 0;
  const viewCount = schema?.tables.filter((t) => t.kind === 'view').length ?? 0;

  const subtitle =
    data === null
      ? busy
        ? `Counting ${tableCount + viewCount} objects…`
        : 'Auto-runs on connect'
      : `${(total ?? 0).toLocaleString()} rows · ${tableCount}T + ${viewCount}V`;

  const action = onRecount && (
    <button
      type="button"
      onClick={onRecount}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCcw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
      {busy ? 'Counting…' : 'Recount'}
    </button>
  );

  return (
    <Panel title="Row counts" subtitle={subtitle} action={action}>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </div>
      )}
      {data === null ? (
        busy ? (
          <SkeletonRows count={6} />
        ) : (
          <EmptyState message="Counts will appear once the schema lands." />
        )
      ) : topRows.length === 0 ? (
        <EmptyState message="Every object is empty." />
      ) : (
        <ul className="grid gap-2">
          {topRows.map((r, idx) => {
            const pct = topMax > 0 ? ((r.count ?? 0) / topMax) * 100 : 0;
            const isView = r.kind === 'view';
            return (
              <li key={`${r.kind}:${r.name}`} className="grid gap-1">
                <div className="flex items-baseline gap-2 text-[11px]">
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-fg-subtle">
                    {idx + 1}.
                  </span>
                  <span
                    className="flex-1 truncate font-mono text-fg"
                    title={r.name}
                  >
                    {r.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] ${
                      isView
                        ? 'bg-blue-500/10 text-blue-300'
                        : 'bg-success/10 text-success'
                    }`}
                  >
                    {isView ? 'view' : 'table'}
                  </span>
                  <span className="font-mono text-fg-muted tabular-nums">
                    {(r.count ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-edge/40">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isView ? '#3b82f6' : '#22c55e',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {errors > 0 && data !== null && (
        <p className="mt-2 text-[10px] text-warning">
          {errors} object(s) couldn't be counted (permissions or invalid view).
        </p>
      )}
    </Panel>
  );
}

/* ===================== PERFORMANCE ===================== */

function PerformanceSection({ samples }: { samples: ActivitySample[] }) {
  const tps = useMemo(() => computeTpsSeries(samples), [samples]);
  const peakTps = tps.reduce((m, v) => Math.max(m, v), 0);
  const lastTps = tps[tps.length - 1] ?? 0;
  const avgTps =
    tps.length > 1
      ? tps.slice(1).reduce((s, v) => s + v, 0) / (tps.length - 1)
      : 0;
  const last = samples[samples.length - 1];

  const subtitle =
    samples.length < 2
      ? 'Sampling… first points land within 2 s'
      : `Last ${samples.length} samples · 2 s cadence`;

  return (
    <Panel title="Performance" subtitle={subtitle}>
      {samples.length < 2 ? (
        <SkeletonRows count={3} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <div className="grid gap-2">
            <PerfChip label="TX / sec" value={lastTps.toFixed(1)} tone="success" />
            <PerfChip
              label="Active stmts"
              value={String(last?.statements ?? 0)}
              tone="info"
            />
            <PerfChip
              label="Attachments"
              value={String(last?.attachments ?? 0)}
              tone="amber"
            />
            <div className="mt-1 text-[10px] text-fg-subtle">
              Peak <span className="font-mono text-fg">{peakTps.toFixed(1)}</span>{' '}
              · Avg <span className="font-mono text-fg">{avgTps.toFixed(1)}</span> tps
            </div>
          </div>
          <div className="grid gap-2">
            <PerfChart label="Transactions / sec" color="#22c55e" series={tps} />
            <PerfChart
              label="Active statements"
              color="#3b82f6"
              series={samples.map((s) => s.statements)}
            />
            <PerfChart
              label="Attachments"
              color="#eab308"
              series={samples.map((s) => s.attachments)}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

function computeTpsSeries(samples: ActivitySample[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = (b.at - a.at) / 1000;
    const dx = b.nextTransaction - a.nextTransaction;
    out.push(dt > 0 && dx >= 0 ? dx / dt : 0);
  }
  return out;
}

function PerfChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'info' | 'amber';
}) {
  const cls =
    tone === 'success'
      ? 'bg-success/10 text-success ring-success/25'
      : tone === 'info'
        ? 'bg-blue-500/10 text-blue-300 ring-blue-500/25'
        : 'bg-warning/10 text-warning ring-warning/25';
  return (
    <div className={`flex items-baseline justify-between rounded-md px-3 py-2 ring-1 ring-inset ${cls}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {label}
      </span>
      <span className="font-mono text-lg font-bold">{value}</span>
    </div>
  );
}

function PerfChart({
  label,
  color,
  series,
}: {
  label: string;
  color: string;
  series: number[];
}) {
  const W = 360;
  const H = 40;
  const PAD = 2;
  const max = Math.max(1, ...series);
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const xAt = (i: number) =>
    PAD + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const yAt = (v: number) => PAD + innerH - (v / max) * innerH;
  const points = series.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  const area = `${PAD},${PAD + innerH} ${points} ${PAD + innerW},${PAD + innerH}`;
  const last = series[series.length - 1] ?? 0;
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[10px]">
        <span className="text-fg-subtle">{label}</span>
        <span className="font-mono text-fg">
          {Number.isInteger(last) ? last : last.toFixed(1)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-10 w-full"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <polygon fill={color} fillOpacity="0.12" points={area} />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

/* ===================== RECENT QUERIES ===================== */

function RecentQueriesPanel({ ctx }: { ctx: DashboardContext }) {
  const recent = useRecentQueries((s) => selectRecent(s, ctx.recentKey ?? ''));
  const list = recent.slice(0, 5);
  const onPick = ctx.onPickRecent;
  return (
    <Panel
      title="Recent queries"
      subtitle={list.length === 0 ? 'No history yet' : `Latest ${list.length}`}
    >
      {list.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          message="Run a statement — the latest five will appear here."
        />
      ) : (
        <ul className="grid gap-1">
          {list.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onPick?.(entry.sql)}
                className="group flex w-full items-start gap-2 rounded-md border border-edge bg-canvas/60 px-3 py-2 text-left text-fg-muted transition-colors hover:border-accent/40 hover:bg-elevated hover:text-fg"
              >
                {entry.status === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                )}
                <div className="min-w-0 flex-1">
                  {entry.label && (
                    <span className="mb-0.5 inline-block rounded bg-accent-subtle px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-accent">
                      {entry.label}
                    </span>
                  )}
                  <p className="truncate font-mono text-[11px]">
                    {previewSql(entry.sql)}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-fg-subtle">
                    {new Date(entry.executedAt).toLocaleTimeString()}
                    {entry.rowCount !== null && ` · ${entry.rowCount} rows`}
                    {' · '}
                    {entry.durationMs} ms
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ===================== TIPS ===================== */

const TIP_ROTATION_MS = 8_000;

export function TipsCard({ engineVersion }: { engineVersion: string | null }) {
  return <TipsPanel engineVersion={engineVersion} />;
}

function TipsPanel({ engineVersion }: { engineVersion: string | null }) {
  const showWelcomeTips = useDisplayStore((s) => s.showWelcomeTips);
  const tips = useMemo<FirebirdTip[]>(
    () => filterTipsForVersion(parseEngineMajor(engineVersion)),
    [engineVersion],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (tips.length === 0) return;
    if (index >= tips.length) setIndex(0);
  }, [tips, index]);

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % tips.length);
    }, TIP_ROTATION_MS);
    return () => window.clearInterval(id);
  }, [tips.length, index]);

  if (!showWelcomeTips) return null;
  if (tips.length === 0) return null;
  const tip = tips[index] ?? tips[0];
  if (!tip) return null;

  const step = (delta: number) => {
    setIndex((n) => {
      const len = tips.length;
      return (((n + delta) % len) + len) % len;
    });
  };

  return (
    <Panel
      title="Tip"
      subtitle={`${index + 1} of ${tips.length}`}
      action={
        tips.length > 1 ? (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous tip"
              className="rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next tip"
              className="rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null
      }
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Lightbulb className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-fg">{tip.text}</p>
          {tip.link && (
            <a
              href={tip.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              Learn more <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ===================== DIAGNOSTICS ===================== */

function DiagnosticsStrip({ stats }: { stats: DatabaseStats | null }) {
  if (!stats?.database) return null;
  const db = stats.database;
  const pages = Number(db.pages);
  const pageSize = Number(db.pageSize);
  const oit = Number(db.oldestTransaction);
  const oat = Number(db.oldestActive);
  const ost = Number(db.oldestSnapshot);
  const gap = Math.max(0, oat - oit);
  const sweepWarning = gap > 10_000;
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-3 lg:grid-cols-6">
      <DiagCell label="Pages" value={pages.toLocaleString()} />
      <DiagCell label="Page size" value={`${pageSize.toLocaleString()} B`} />
      <DiagCell label="OIT" value={oit.toLocaleString()} mono />
      <DiagCell label="OAT" value={oat.toLocaleString()} mono />
      <DiagCell label="OST" value={ost.toLocaleString()} mono />
      <DiagCell
        label="Sweep gap"
        value={gap.toLocaleString()}
        warning={sweepWarning}
      />
    </section>
  );
}

function DiagCell({
  label,
  value,
  mono = false,
  warning = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-panel px-3 py-2">
      <span
        className={`text-[9px] font-semibold uppercase tracking-wide ${
          warning ? 'text-warning' : 'text-fg-subtle'
        }`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-sm font-bold ${
          warning ? 'text-warning' : 'text-fg'
        } ${mono ? '' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ===================== SHARED PRIMITIVES ===================== */

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-panel">
      <header className="flex items-center gap-3 border-b border-edge px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg">
            {title}
          </h2>
          {subtitle && (
            <p className="truncate text-[10px] text-fg-subtle">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function EmptyState({
  message,
  icon: Icon = Sparkles,
}: {
  message: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-edge px-4 py-5 text-center text-[11px] italic text-fg-subtle">
      <Icon className="h-4 w-4 text-fg-subtle/60" />
      {message}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <ul className="grid gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="h-3 animate-pulse rounded bg-edge/40" />
      ))}
    </ul>
  );
}

/* ===================== LEGACY EXPORTS ===================== */

// Preserved for backward-compatibility with built-in `default-sections`
// consumers; the new layout inlines its own variants.

export function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border border-edge bg-canvas px-3 py-2">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <span className="font-mono text-[14px] font-semibold text-fg">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export function InfoCell({
  icon: Icon,
  label,
  value,
  mono = false,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  title?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-edge bg-canvas px-3 py-2">
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span
        className={`truncate text-[12px] text-fg ${mono ? 'font-mono' : ''}`}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

interface Counts {
  tables: number;
  views: number;
  procedures: number;
  triggers: number;
  generators: number;
  domains: number;
}

export function countsFromSchema(schema: Schema | null): Counts {
  if (!schema) {
    return {
      tables: 0,
      views: 0,
      procedures: 0,
      triggers: 0,
      generators: 0,
      domains: 0,
    };
  }
  let tables = 0;
  let views = 0;
  for (const t of schema.tables) {
    if (t.kind === 'view') views += 1;
    else tables += 1;
  }
  return {
    tables,
    views,
    procedures: schema.procedures?.length ?? 0,
    triggers: schema.triggers?.length ?? 0,
    generators: schema.generators?.length ?? 0,
    domains: schema.domains?.length ?? 0,
  };
}

/* ===================== HELPERS ===================== */

export function stemOf(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return 'Firebird';
  const tail = trimmed.split(/[\\/]/).pop();
  return tail && tail.length > 0 ? tail : trimmed;
}

export function previewSql(sql: string): string {
  const trimmed = sql.trim();
  const first = trimmed.split(/\r?\n/)[0] ?? trimmed;
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

export function formatRelative(at: number, _tick: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
