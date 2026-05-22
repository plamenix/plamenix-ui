/**
 * Mutation classification + toast-push helpers. Called by host
 * editions after every `execute` round-trip to surface DDL/DML
 * outcomes as toasts.
 *
 * Read-only statements (SELECT / WITH / EXECUTE BLOCK returning) are
 * filtered out — the result table already shows their outcome inline
 * and the user doesn't need a second confirmation.
 */

import type { StatementOutcome } from '../db/types';
import { useToastStore } from './toast-store';

export type MutationKind =
  | 'insert'
  | 'update'
  | 'delete'
  | 'drop'
  | 'alter'
  | 'create'
  | 'recreate'
  | 'truncate'
  | 'grant'
  | 'revoke'
  | 'merge'
  | 'commit'
  | 'rollback'
  | 'set';

const MUTATION_KEYWORDS = new Map<string, MutationKind>([
  ['insert', 'insert'],
  ['update', 'update'],
  ['delete', 'delete'],
  ['drop', 'drop'],
  ['alter', 'alter'],
  ['create', 'create'],
  ['recreate', 'recreate'],
  ['truncate', 'truncate'],
  ['grant', 'grant'],
  ['revoke', 'revoke'],
  ['merge', 'merge'],
  ['commit', 'commit'],
  ['rollback', 'rollback'],
  ['set', 'set'],
]);

/** Inspects the leading SQL keyword and returns the mutation kind, or
 *  `null` for non-mutating statements. Comments / leading whitespace
 *  are skipped. */
export function mutationKind(sql: string): MutationKind | null {
  const stripped = stripLeadingFluff(sql);
  const m = stripped.match(/^([A-Za-z]+)/);
  if (!m) return null;
  return MUTATION_KEYWORDS.get(m[1]!.toLowerCase()) ?? null;
}

function stripLeadingFluff(sql: string): string {
  let s = sql.trimStart();
  while (s.length > 0) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl < 0 ? '' : s.slice(nl + 1).trimStart();
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end < 0 ? '' : s.slice(end + 2).trimStart();
    } else {
      break;
    }
  }
  return s;
}

function previewSql(sql: string, max = 80): string {
  const collapsed = sql.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1)}…`;
}

/**
 * Push one toast per mutation. When the batch has more than one
 * mutation a single summary toast is emitted instead, so a 100-row
 * script doesn't flood the viewport.
 */
export function notifyMutations(outcomes: StatementOutcome[]): void {
  const mutations: {
    kind: MutationKind;
    sql: string;
    durationMs: number;
    affectedRows?: number;
  }[] = [];

  for (const outcome of outcomes) {
    if (outcome.status !== 'ok') continue;
    const kind = mutationKind(outcome.sql);
    if (!kind) continue;
    const affectedRows =
      'Affected' in outcome.result ? outcome.result.Affected.rows : undefined;
    const entry: {
      kind: MutationKind;
      sql: string;
      durationMs: number;
      affectedRows?: number;
    } = {
      kind,
      sql: outcome.sql,
      durationMs: outcome.durationMs,
    };
    if (affectedRows !== undefined) entry.affectedRows = affectedRows;
    mutations.push(entry);
  }

  if (mutations.length === 0) return;

  const push = useToastStore.getState().push;

  if (mutations.length === 1) {
    const m = mutations[0]!;
    const title = buildSingleTitle(m.kind, m.affectedRows, m.durationMs);
    push({
      kind: 'mutation',
      title,
      sql: m.sql,
      durationMs: m.durationMs,
      affectedRows: m.affectedRows,
    });
    return;
  }

  const counts = new Map<MutationKind, number>();
  let totalAffected = 0;
  let totalDuration = 0;
  for (const m of mutations) {
    counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    if (m.affectedRows !== undefined) totalAffected += m.affectedRows;
    totalDuration += m.durationMs;
  }
  const breakdown = [...counts.entries()]
    .map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`)
    .join(', ');
  push({
    kind: 'mutation-batch',
    title: `${mutations.length} mutations · ${breakdown} · ${formatDuration(totalDuration)}${
      totalAffected > 0 ? ` · ${totalAffected.toLocaleString()} rows` : ''
    }`,
    statements: mutations.map((m) => {
      const entry: { sql: string; durationMs: number; affectedRows?: number } = {
        sql: m.sql,
        durationMs: m.durationMs,
      };
      if (m.affectedRows !== undefined) entry.affectedRows = m.affectedRows;
      return entry;
    }),
    totalDurationMs: totalDuration,
  });
}

/**
 * Push a single mutation toast when the caller already knows the SQL
 * but didn't go through `executeBatch` — e.g. inline cell edits that
 * call `db_execute` once and don't unwrap the outcome envelope before
 * acting on it.
 */
export function notifySingleMutation(args: {
  sql: string;
  durationMs: number;
  affectedRows?: number | undefined;
}): void {
  const kind = mutationKind(args.sql);
  if (!kind) return;
  const push = useToastStore.getState().push;
  push({
    kind: 'mutation',
    title: buildSingleTitle(kind, args.affectedRows, args.durationMs),
    sql: args.sql,
    durationMs: args.durationMs,
    affectedRows: args.affectedRows,
  });
}

function buildSingleTitle(
  kind: MutationKind,
  affected: number | undefined,
  durationMs: number,
): string {
  const upper = kind.toUpperCase();
  const rowsPart =
    affected !== undefined
      ? ` · ${affected.toLocaleString()} row${affected === 1 ? '' : 's'}`
      : '';
  return `${upper}${rowsPart} · ${formatDuration(durationMs)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export { previewSql };
