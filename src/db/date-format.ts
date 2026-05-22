/**
 * Display-side date/time/timestamp formatting for result cells.
 *
 * Firebird's rsfbclient driver returns DATE / TIME / TIMESTAMP values
 * as ISO-shaped strings (`YYYY-MM-DD`, `HH:MM:SS[.SSSS]`,
 * `YYYY-MM-DD HH:MM:SS[.SSSS][ TZ]`). We sniff that shape from the
 * cell text alone — result columns do not carry SQL type metadata —
 * and re-emit it under the user-chosen format. Non-matching text
 * falls through unchanged so plain `text` cells never get garbled.
 *
 * Timestamps from Firebird are naive (no TZ in the body except for
 * `TIMESTAMP WITH TIME ZONE`). The relative formatter therefore
 * treats the value as local-clock time. This is the same trade-off
 * isql and other Firebird clients make.
 */

import type { DateFormat } from './display-store';

type DateCellKind = 'date' | 'time' | 'timestamp';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,4})?$/;
const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d{1,4})?(?: [\w/+\-:]+)?$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function sniffKind(text: string): DateCellKind | null {
  if (DATE_RE.test(text)) return 'date';
  if (TIME_RE.test(text)) return 'time';
  if (TIMESTAMP_RE.test(text)) return 'timestamp';
  return null;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseParts(text: string, kind: DateCellKind): Parts | null {
  if (kind === 'date') {
    const m = DATE_RE.exec(text);
    if (!m) return null;
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: 0,
      minute: 0,
      second: 0,
    };
  }
  if (kind === 'time') {
    const m = TIME_RE.exec(text);
    if (!m) return null;
    return {
      year: 1970,
      month: 1,
      day: 1,
      hour: Number(m[1]),
      minute: Number(m[2]),
      second: Number(m[3]),
    };
  }
  const m = TIMESTAMP_RE.exec(text);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6]),
  };
}

function formatAbsolute(parts: Parts, kind: DateCellKind, fmt: DateFormat): string {
  const Y = String(parts.year).padStart(4, '0');
  const M = pad2(parts.month);
  const D = pad2(parts.day);
  const H = pad2(parts.hour);
  const m = pad2(parts.minute);
  const S = pad2(parts.second);

  if (kind === 'time') return `${H}:${m}:${S}`;

  const datePart =
    fmt === 'eu' ? `${D}.${M}.${Y}` : fmt === 'us' ? `${M}/${D}/${Y}` : `${Y}-${M}-${D}`;
  if (kind === 'date') return datePart;
  return `${datePart} ${H}:${m}:${S}`;
}

function partsToLocalDate(parts: Parts): Date {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function formatRelative(parts: Parts, now: Date): string {
  const target = partsToLocalDate(parts);
  const diffMs = target.getTime() - now.getTime();
  const past = diffMs < 0;
  const seconds = Math.floor(Math.abs(diffMs) / 1000);
  let value: number;
  let unit: string;
  if (seconds < 5) return 'just now';
  if (seconds < 60) {
    value = seconds;
    unit = 's';
  } else if (seconds < 3600) {
    value = Math.floor(seconds / 60);
    unit = 'm';
  } else if (seconds < 86_400) {
    value = Math.floor(seconds / 3600);
    unit = 'h';
  } else if (seconds < 86_400 * 30) {
    value = Math.floor(seconds / 86_400);
    unit = 'd';
  } else if (seconds < 86_400 * 365) {
    value = Math.floor(seconds / (86_400 * 30));
    unit = 'mo';
  } else {
    value = Math.floor(seconds / (86_400 * 365));
    unit = 'y';
  }
  return past ? `${value}${unit} ago` : `in ${value}${unit}`;
}

/**
 * Format a text-encoded date/time/timestamp cell under the chosen
 * display format. Returns the input unchanged when:
 *
 *   - the text doesn't match a known date/time/timestamp shape, or
 *   - the parse fails (shouldn't happen given the sniff passed), or
 *   - the format is `iso` (driver output is already ISO-shaped).
 */
export function formatDateCell(text: string, fmt: DateFormat, now: Date = new Date()): string {
  if (fmt === 'iso') return text;
  const kind = sniffKind(text);
  if (!kind) return text;
  const parts = parseParts(text, kind);
  if (!parts) return text;
  if (fmt === 'relative') return formatRelative(parts, now);
  return formatAbsolute(parts, kind, fmt);
}
