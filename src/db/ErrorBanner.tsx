import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  errorKindLabel,
  parseFirebirdError,
  type FirebirdErrorInfo,
} from './error-info';

export interface ErrorBannerProps {
  /** Error to render. Strings are parsed via
   *  {@link parseFirebirdError}; structured infos pass through. */
  error: string | FirebirdErrorInfo;
  /** When provided, renders a close button. */
  onDismiss?: () => void;
  /** Compact mode: drop the kind/code header strip; keep the message
   *  and codes only. Useful inside StatementCard error rows. */
  compact?: boolean;
}

/**
 * Tinted error display with Firebird-aware metadata.
 *
 * Renders:
 *  - kind chip ("SQL error", "Connection error", …)
 *  - GDS / SQLCODE / SQLSTATE pills when present
 *  - cleaned message
 *  - friendly hint when one is known
 *  - collapsed raw text (toggleable when it differs from `message`)
 */
export function ErrorBanner({ error, onDismiss, compact = false }: ErrorBannerProps) {
  const info = typeof error === 'string' ? parseFirebirdError(error) : error;
  const [showRaw, setShowRaw] = useState(false);
  const hasRaw = info.raw.trim() !== info.message.trim();

  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-subtle text-danger"
    >
      {!compact && (
        <div className="flex items-center justify-between gap-2 border-b border-danger/20 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{errorKindLabel(info.kind)}</span>
          </div>
          <div className="flex items-center gap-1">
            <CodePills info={info} />
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="ml-1 rounded p-1 text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`space-y-2 px-3 ${compact ? 'py-2.5' : 'py-3'}`}>
        {compact && (
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{errorKindLabel(info.kind)}</span>
            <CodePills info={info} />
          </div>
        )}

        <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-danger">
          {info.message}
        </p>

        {info.hint && (
          <p className="text-[11px] italic text-danger/80">{info.hint}</p>
        )}

        {hasRaw && (
          <div>
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-danger/70 transition-colors hover:text-danger"
            >
              {showRaw ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {showRaw ? 'Hide raw' : 'Show raw'}
            </button>
            {showRaw && (
              <pre className="mt-1 whitespace-pre-wrap rounded bg-danger/10 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-danger/90">
                {info.raw}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CodePills({ info }: { info: FirebirdErrorInfo }) {
  const pill = (label: string, value: string) => (
    <span
      key={label}
      className="inline-flex items-center gap-0.5 rounded bg-danger/10 px-1.5 py-px font-mono text-[10px] text-danger"
    >
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-1">
      {info.gdsCode !== undefined && pill('GDS', String(info.gdsCode))}
      {info.sqlCode !== undefined && pill('SQLCODE', String(info.sqlCode))}
      {info.sqlState !== undefined && pill('SQLSTATE', info.sqlState)}
    </span>
  );
}
