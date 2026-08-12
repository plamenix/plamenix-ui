import {
  emitExportCompleted,
  emitExportFailed,
  emitExportStarted,
  newExportId,
} from '../events/export-events.js';
import { exportStartingChain } from '../interceptors/export-starting.js';
import type { StreamedExportRequest, StreamedExportResult } from './streamed-export.js';

/**
 * The policy and reporting around an export, with the transfer left to
 * the edition.
 *
 * Export is the product's data-egress path: it is how rows leave the
 * database and land on somebody's disk. The `export.starting` chain is
 * what a deployment uses to say "not this table" or "not this format",
 * and the three events are how anything else learns an export happened.
 * All of that was written twice, byte-identical, wrapped around two
 * genuinely different transfers — the desktop shell streams chunks over
 * Tauri events, the web edition reads one HTTP response.
 *
 * Duplicating a veto is the failure mode worth avoiding here. A policy
 * enforced in one shell and not the other is worse than no policy,
 * because it reads as covered.
 */

/** Everything the chain and the events need that is not in the request. */
export interface GuardedExportOptions {
  /** Tab the export belongs to. */
  tabId: string;
  /**
   * Performs the actual transfer and produces the file.
   *
   * Runs only after the chain has allowed the export. Throwing is how a
   * failure is reported; the wrapper turns it into an `export.failed`
   * event and rethrows, so callers see the original error.
   */
  transfer: (req: StreamedExportRequest, exportId: string) => Promise<StreamedExportResult>;
  /** Injectable for tests. */
  now?: () => number;
  /** Injectable for tests. */
  makeExportId?: () => string;
}

/**
 * Describes an export's scope in one line, for the chain and for the
 * events.
 *
 * A statement export prefers its own label, then the table it reads,
 * then the first eighty characters of the SQL — the last is a fallback
 * rather than a choice, but an ad-hoc export with no other name still
 * has to be identifiable in a policy decision and in an audit trail.
 */
export function describeExportScope(scope: StreamedExportRequest['scope']): {
  scopeLabel: string;
  tables: string[];
} {
  if (scope.kind === 'statement') {
    return {
      scopeLabel: scope.label ?? scope.table?.name ?? scope.sql.slice(0, 80),
      tables: scope.table ? [scope.table.name] : [],
    };
  }
  return {
    scopeLabel: scope.tables.map((t) => t.name).join(', '),
    tables: scope.tables.map((t) => t.name),
  };
}

/**
 * Runs an export through the `export.starting` chain, announces it, and
 * reports how it ended.
 *
 * @throws The chain's reason when a handler refuses, before any data is
 * read. Also rethrows whatever `transfer` threw, after announcing the
 * failure — the caller's error handling is not this function's to
 * change.
 */
export async function runGuardedExport(
  req: StreamedExportRequest,
  options: GuardedExportOptions,
): Promise<StreamedExportResult> {
  const now = options.now ?? Date.now;
  const exportId = (options.makeExportId ?? newExportId)();
  const startedAt = now();
  const { scopeLabel, tables } = describeExportScope(req.scope);

  const decision = await exportStartingChain.run({
    tabId: options.tabId,
    sessionId: req.sessionId,
    format: req.format,
    scopeKind: req.scope.kind,
    scopeLabel,
    tables,
  });
  if (decision.action === 'cancel') {
    // Thrown rather than returned: the caller is a file-save flow, and
    // a refusal that looked like an empty result would write an empty
    // file. No `export.failed` event either — nothing started, and a
    // refusal is not a fault to be alerted on.
    throw new Error(decision.reason);
  }

  emitExportStarted({
    exportId,
    tabId: options.tabId,
    sessionId: req.sessionId,
    format: req.format,
    scopeKind: req.scope.kind,
    scopeLabel,
    startedAt,
  });

  try {
    const result = await options.transfer(req, exportId);
    emitExportCompleted({
      exportId,
      durationMs: now() - startedAt,
      byteSize: result.blob.size,
      rowCount: null,
      completedAt: now(),
    });
    return result;
  } catch (err) {
    emitExportFailed({
      exportId,
      durationMs: now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      failedAt: now(),
    });
    throw err;
  }
}
