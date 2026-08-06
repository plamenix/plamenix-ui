/**
 * Export events (I6.9) — three topics covering the export lifecycle:
 *
 *   - `export/started`    — fires when an export operation begins
 *                            (streamed result-set export OR full-
 *                            database export). Subscribers use this
 *                            to mount progress UI / start telemetry
 *                            spans.
 *   - `export/completed`  — fires when the export resolves
 *                            successfully. Carries the exportId from
 *                            the matching `started` event so
 *                            subscribers correlate pairs without
 *                            tracking their own state.
 *   - `export/failed`     — fires when the export rejects. Same
 *                            exportId correlation as `completed`.
 *
 * All three are imperative emit (no diff hook) — exports are user-
 * action-triggered from React event handlers in the export modals.
 * The handlers know exactly when the work starts + when the promise
 * settles, so emit at those points.
 *
 * Use {@link newExportId} at the start of an export to generate an
 * id, pass it through to the `completed` / `failed` emit so the
 * pair correlates.
 */

import { eventBus } from './event-bus.js';

/** Topic literals. */
export const EXPORT_STARTED = 'export/started' as const;
export const EXPORT_COMPLETED = 'export/completed' as const;
export const EXPORT_FAILED = 'export/failed' as const;

/** Scope discriminator — covers both streamed result-set exports
 *  (statement + tables) and full-database export (database). */
export type ExportScopeKind = 'statement' | 'tables' | 'database';

export interface ExportStartedPayload {
  /** Correlation id — same value lands in the matching `completed` /
   *  `failed` event so subscribers pair started ↔ ended without
   *  tracking their own state. Generate via {@link newExportId}. */
  exportId: string;
  /** Tab that initiated the export. `null` for editions whose
   *  database-export entry point isn't tab-scoped (none today; kept
   *  nullable for future-proofing). */
  tabId: string | null;
  /** Session the export ran against. `null` for the unusual case
   *  where the export ran without an attached session (theoretical
   *  only — every export today requires a live session). */
  sessionId: string | null;
  /** File format the export produces — `csv` / `json` / `sql` /
   *  `xml` for streamed, plus a host-defined string for
   *  database-scope exports (typically `'sql'` for the schema+data
   *  dump). */
  format: string;
  /** Scope kind. `statement` for one-result-set export, `tables` for
   *  the multi-table picker flow, `database` for full-database. */
  scopeKind: ExportScopeKind;
  /** Human label describing the scope — table name for single-table,
   *  comma-joined names for `tables`, `'database'` for full. Useful
   *  for progress UI strings without subscribers re-deriving from
   *  the raw scope. */
  scopeLabel: string;
  startedAt: number;
}

export interface ExportCompletedPayload {
  exportId: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Size of the produced blob in bytes. `null` when the runner
   *  doesn't surface size (e.g. server-side streamed exports that
   *  resolve with a download URL rather than a Blob). */
  byteSize: number | null;
  /** Total row count exported across all statements / tables. `null`
   *  when the runner doesn't surface a row count (currently the
   *  streamed runner doesn't; database export aggregates per-table). */
  rowCount: number | null;
  completedAt: number;
}

export interface ExportFailedPayload {
  exportId: string;
  durationMs: number;
  /** Stringified runner error. */
  error: string;
  failedAt: number;
}

export function emitExportStarted(payload: ExportStartedPayload): void {
  eventBus.emit<ExportStartedPayload>(EXPORT_STARTED, payload);
}

export function emitExportCompleted(payload: ExportCompletedPayload): void {
  eventBus.emit<ExportCompletedPayload>(EXPORT_COMPLETED, payload);
}

export function emitExportFailed(payload: ExportFailedPayload): void {
  eventBus.emit<ExportFailedPayload>(EXPORT_FAILED, payload);
}

let exportIdCounter = 0;

/** Generates a unique export id for one started ↔ completed/failed
 *  pair. Format: `exp_<timestamp>_<counter>` — collision-free within
 *  a single host process. Reset by tests via {@link __resetExportIds}. */
export function newExportId(now: () => number = Date.now): string {
  exportIdCounter += 1;
  return `exp_${now()}_${exportIdCounter}`;
}

/** Test-only — resets the in-process counter so test runs see
 *  deterministic ids when paired with a fixed `now()`. */
export function __resetExportIds(): void {
  exportIdCounter = 0;
}
