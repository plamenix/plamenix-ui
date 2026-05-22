import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
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
import { useDisplayStore } from './display-store';
import {
  filterTipsForVersion,
  parseEngineMajor,
  type FirebirdTip,
} from './firebird-tips';
import { selectRecent, useRecentQueries } from './recent-queries';
import { SqlHighlight } from './SqlHighlight';
import type { Schema } from './types';

export interface WelcomeDashboardProps {
  sessionId: string;
  user: string;
  host: string;
  port: number;
  database: string;
  engineVersion: string | null;
  connectedAt: number | null;
  schema: Schema | null;
  /** Free-form key for the recent-queries store. Typically the active
   *  profile name; falls back to `host/db-stem` when no profile is in
   *  use. The host owns the key so multiple tabs against the same
   *  profile share a recent list. */
  recentKey: string;
  /** Called when the user picks a recent entry. Host typically pastes
   *  the SQL into the editor buffer. */
  onPickRecent: (sql: string) => void;
}

/**
 * Info-only landing panel surfaced when a session is open but no
 * query has run yet. Renders server info, schema entity counts, and a
 * short recent-queries snippet. No EXPLAIN PLAN, no index stats, no
 * query-cost analytics — those are M2 scope.
 */
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
}: WelcomeDashboardProps) {
  const recent = useRecentQueries((s) => selectRecent(s, recentKey));
  const recentTop = recent.slice(0, 5);
  const showWelcomeTips = useDisplayStore((s) => s.showWelcomeTips);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dbStem = stemOf(database);
  const counts = countsFromSchema(schema);
  const connectedLabel =
    connectedAt !== null ? formatRelative(connectedAt, tick) : null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-edge bg-panel p-4">
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
        <InfoCell icon={UserIcon} label="User" value={user || '—'} />
        <InfoCell
          icon={Zap}
          label="Engine"
          value={engineVersion ? `Firebird ${engineVersion}` : 'Firebird (probing…)'}
        />
        <InfoCell icon={Network} label="Host" value={`${host}:${port}`} />
        <InfoCell icon={Database} label="Database" value={database} mono title={database} />
        <InfoCell icon={Fingerprint} label="Session" value={sessionId} mono title={sessionId} />
        <InfoCell
          icon={Activity}
          label="Connected"
          value={connectedLabel ?? '—'}
          title={connectedAt !== null ? new Date(connectedAt).toLocaleString() : undefined}
        />
      </div>

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

      {showWelcomeTips && <TipsCard engineVersion={engineVersion} />}

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
                  onClick={() => onPickRecent(entry.sql)}
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
    </section>
  );
}

const TIP_ROTATION_MS = 8_000;

function TipsCard({ engineVersion }: { engineVersion: string | null }) {
  const tips = useMemo<FirebirdTip[]>(
    () => filterTipsForVersion(parseEngineMajor(engineVersion)),
    [engineVersion],
  );
  const [index, setIndex] = useState(0);

  // Keep the cursor in range when the filtered list size changes
  // (e.g. the engine version arrives after the first render).
  useEffect(() => {
    if (tips.length === 0) return;
    if (index >= tips.length) setIndex(0);
  }, [tips, index]);

  // Auto-rotate; the timer resets whenever the user clicks prev/next so
  // a manual nudge gets the full 8 s of dwell time on the new tip.
  useEffect(() => {
    if (tips.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % tips.length);
    }, TIP_ROTATION_MS);
    return () => window.clearInterval(id);
  }, [tips.length, index]);

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
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        <Lightbulb className="h-3 w-3" /> Tip
      </h3>
      <div className="flex items-start gap-3 rounded-md border border-edge bg-canvas px-3 py-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <Lightbulb className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-snug text-fg">{tip.text}</p>
          {tip.link && (
            <a
              href={tip.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
            >
              Learn more <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous tip"
            title="Previous tip"
            disabled={tips.length <= 1}
            className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span
            className="font-mono text-[10px] tabular-nums text-fg-subtle"
            title={`Showing tip ${index + 1} of ${tips.length}`}
          >
            {index + 1}/{tips.length}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next tip"
            title="Next tip"
            disabled={tips.length <= 1}
            className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </section>
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

function countsFromSchema(schema: Schema | null): Counts {
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

function InfoCell({
  icon: Icon,
  label,
  value,
  mono = false,
  title,
}: {
  icon: typeof UserIcon;
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

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border border-edge bg-canvas px-3 py-2">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <span className="font-mono text-[14px] font-semibold text-fg">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function stemOf(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return 'Firebird';
  const tail = trimmed.split(/[\\/]/).pop();
  return tail && tail.length > 0 ? tail : trimmed;
}

function previewSql(sql: string): string {
  const trimmed = sql.trim();
  const first = trimmed.split(/\r?\n/)[0] ?? trimmed;
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

function formatRelative(at: number, _tick: number): string {
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
