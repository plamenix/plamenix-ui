import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Binary,
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Type,
  X,
} from 'lucide-react';

import { bytesToBase64, decodeHex, sniffBlob, type BlobMime } from './blob-sniff';

export interface BlobViewerProps {
  /** Whether the viewer is open. When `false`, the component renders
   *  nothing. Loading and ready states share the same `open=true`
   *  region so the modal stays mounted while bytes arrive. */
  open: boolean;
  /** Hex-encoded BLOB value as returned by the host's fetch step.
   *  `null` while the fetch is in flight; the modal renders a loading
   *  state. Becomes a string once the bytes land. */
  hex: string | null;
  /** Failure surfaced from the fetch step. Shown in the modal body
   *  with a dismiss affordance. */
  error?: string | null | undefined;
  /** Label rendered in the header — usually `<table>.<column>` or just
   *  the column name. */
  label?: string | undefined;
  /** Fired when the user dismisses the viewer (click backdrop, hit
   *  Escape, or click the close icon). */
  onClose: () => void;
  /** Optional write-back handler. When supplied, the viewer becomes
   *  an editor: a Pencil toggle reveals an editable text / hex pane
   *  and a Save button commits the bytes (hex-encoded). The host
   *  resolves to confirm the round-trip; rejecting with an error
   *  surfaces it inline without closing. Omit for read-only use. */
  onCommit?: ((hex: string) => Promise<void>) | undefined;
}

type Tab = 'hex' | 'text' | 'preview';

function canPreview(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf';
}

const HEX_PAGE_SIZE = 1024;

/** Practical cap on hex literal size when committing through a plain
 *  SQL `UPDATE` statement. Firebird's parser and the wire protocol
 *  both accept fairly long literals, but DSQL statement-text length
 *  caps around 64 KB; staying under 24 KB of post-hex bytes (≈ 48 KB
 *  of hex characters plus the surrounding statement) keeps a margin
 *  for the SET clause and WHERE predicate. Larger BLOBs would need
 *  parameterised binding, which the driver does not expose yet. */
const MAX_COMMIT_BYTES = 24_576;

/**
 * Modal BLOB viewer with three tabs: Text (UTF-8 decode), Image
 * (data-URI render), Hex (paginated dump). MIME sniffing on the leading
 * bytes picks the default tab and the chip label.
 *
 * When the host supplies `onCommit`, the viewer becomes an editor:
 * the Text and Hex tabs render as editable textareas, a pencil toggle
 * switches modes, and a Save button hex-encodes the draft bytes and
 * fires `onCommit`. The Image tab stays read-only — inline image
 * editing is out of scope for v1.
 */
export function BlobViewer({
  open,
  hex,
  error,
  label,
  onClose,
  onCommit,
}: BlobViewerProps) {
  const [tab, setTab] = useState<Tab>('hex');
  const [hexPage, setHexPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState<string>('');
  const [draftHex, setDraftHex] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const bytes = useMemo<Uint8Array | null>(() => {
    if (hex === null) return null;
    try {
      return decodeHex(hex);
    } catch {
      return null;
    }
  }, [hex]);

  const sniff = useMemo<BlobMime | null>(() => {
    if (!bytes) return null;
    return sniffBlob(bytes);
  }, [bytes]);

  const base64 = useMemo<string>(() => (bytes ? bytesToBase64(bytes) : ''), [bytes]);

  useEffect(() => {
    if (sniff) setTab(sniff.defaultTab);
    setHexPage(0);
  }, [sniff]);

  // Reset edit state whenever the underlying bytes change (e.g. user
  // opens a different BLOB) or the modal closes.
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    if (bytes) {
      setDraftText(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
      setDraftHex(toHexString(bytes));
    } else {
      setDraftText('');
      setDraftHex('');
    }
  }, [bytes]);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setSaveError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (error || hex === null || !bytes || !sniff) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="BLOB viewer"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
        onClick={onClose}
      >
        <div
          className="flex w-[min(28rem,90vw)] flex-col gap-3 rounded-xl border border-edge bg-panel p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <Binary className="h-4 w-4 text-accent" />
            <h2 className="font-mono text-[13px] font-semibold text-fg">
              {label ?? 'BLOB'}
            </h2>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {error ? (
            <p className="rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-fg-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching BLOB body…
            </div>
          )}
        </div>
      </div>
    );
  }

  const size = bytes.length;
  const fileName = `blob-${size}.${guessExtension(sniff.mime)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="BLOB viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-[min(960px,95vw)] flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-edge px-4 py-3">
          <Binary className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2
                className="truncate font-mono text-[13px] font-semibold text-fg"
                title={label ?? 'BLOB'}
              >
                {label ?? 'BLOB'}
              </h2>
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                {sniff.label}
              </span>
            </div>
            <p className="font-mono text-[11px] text-fg-subtle">
              {sniff.mime} · {formatBytes(size)}
            </p>
          </div>
          <a
            href={`data:${sniff.mime};base64,${base64}`}
            download={fileName}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          {onCommit && !editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setSaveError(null);
                if (tab === 'preview') setTab('text');
              }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
              title="Edit this BLOB"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          {onCommit && editing && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                  if (bytes) {
                    setDraftText(
                      new TextDecoder('utf-8', { fatal: false }).decode(bytes),
                    );
                    setDraftHex(toHexString(bytes));
                  }
                }}
                className="rounded-md px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaveError(null);
                  const parsed = serialiseDraft(tab, draftText, draftHex);
                  if (parsed.kind === 'err') {
                    setSaveError(parsed.message);
                    return;
                  }
                  if (parsed.bytes.length > MAX_COMMIT_BYTES) {
                    setSaveError(
                      `BLOB too large for inline UPDATE (${parsed.bytes.length} bytes; cap is ${MAX_COMMIT_BYTES}). Parameterised BLOB binding is not yet supported.`,
                    );
                    return;
                  }
                  setSaving(true);
                  try {
                    await onCommit(toHexString(parsed.bytes));
                    setEditing(false);
                  } catch (err) {
                    setSaveError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setSaving(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-fg-inverted transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {saveError && (
          <div className="flex items-start gap-2 border-b border-edge bg-danger-subtle px-4 py-2 text-[12px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <nav role="tablist" className="flex shrink-0 border-b border-edge bg-canvas px-3">
          <TabButton
            tab="hex"
            current={tab}
            icon={FileText}
            label="Hex"
            onSelect={() => setTab('hex')}
          />
          <TabButton
            tab="text"
            current={tab}
            icon={Type}
            label="Text"
            onSelect={() => setTab('text')}
          />
          <TabButton
            tab="preview"
            current={tab}
            icon={Eye}
            label="Preview"
            onSelect={() => setTab('preview')}
            disabled={!canPreview(sniff.mime)}
          />
        </nav>

        <div className="flex-1 overflow-hidden">
          {tab === 'hex' &&
            (editing ? (
              <HexEditPane value={draftHex} onChange={setDraftHex} />
            ) : (
              <HexPane
                bytes={bytes}
                page={hexPage}
                pageSize={HEX_PAGE_SIZE}
                onPageChange={setHexPage}
              />
            ))}
          {tab === 'text' &&
            (editing ? (
              <TextEditPane value={draftText} onChange={setDraftText} />
            ) : (
              <TextPane bytes={bytes} />
            ))}
          {tab === 'preview' &&
            (sniff.mime.startsWith('image/') ? (
              <ImagePane base64={base64} mime={sniff.mime} />
            ) : sniff.mime === 'application/pdf' ? (
              <PdfPane bytes={bytes} />
            ) : (
              <p className="flex h-full items-center justify-center text-sm italic text-fg-subtle">
                No inline preview for this MIME type.
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  tab,
  current,
  icon: Icon,
  label,
  onSelect,
  disabled = false,
}: {
  tab: Tab;
  current: Tab;
  icon: typeof Eye;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const active = current === tab;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onSelect}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-medium transition-colors ${
        active
          ? 'border-accent text-accent'
          : disabled
            ? 'border-transparent text-fg-subtle/50'
            : 'border-transparent text-fg-muted hover:text-fg'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TextPane({ bytes }: { bytes: Uint8Array }) {
  const text = useMemo(() => {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  }, [bytes]);
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-canvas p-4 font-mono text-[12px] text-fg">
      {text || <span className="italic text-fg-subtle">(empty)</span>}
    </pre>
  );
}

function PdfPane({ bytes }: { bytes: Uint8Array }) {
  const url = useMemo(() => {
    const view = new Uint8Array(bytes);
    const blob = new Blob([view], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }, [bytes]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <iframe
      title="PDF preview"
      src={url}
      className="h-full w-full bg-canvas"
      sandbox=""
    />
  );
}

function ImagePane({ base64, mime }: { base64: string; mime: string }) {
  if (!mime.startsWith('image/')) {
    return (
      <p className="flex h-full items-center justify-center text-sm italic text-fg-subtle">
        Not an image.
      </p>
    );
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(theme(colors.elevated)_0_25%,theme(colors.canvas)_0_50%)] bg-[length:24px_24px] p-6">
      <img
        src={`data:${mime};base64,${base64}`}
        alt="BLOB preview"
        className="max-h-full max-w-full rounded-md shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
      />
    </div>
  );
}

function HexPane({
  bytes,
  page,
  pageSize,
  onPageChange,
}: {
  bytes: Uint8Array;
  page: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(bytes.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const slice = bytes.subarray(start, Math.min(bytes.length, start + pageSize));
  const lines = formatHexLines(slice, start);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto bg-canvas">
        <pre className="p-4 font-mono text-[11px] leading-[1.45] text-fg">
          {lines.map((line, i) => (
            <div key={i}>
              <span className="text-fg-subtle">{line.offset}</span>
              {'  '}
              <span className="text-fg">{line.hex}</span>
              {'  '}
              <span className="text-fg-muted">{line.ascii}</span>
            </div>
          ))}
        </pre>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-edge bg-canvas px-4 py-2 font-mono text-[11px] text-fg-subtle">
        <span>
          {formatBytes(start)} – {formatBytes(start + slice.length)} of {formatBytes(bytes.length)}
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded border border-edge px-2 py-0.5 text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
          >
            ← Prev
          </button>
          <span>
            page {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            className="rounded border border-edge px-2 py-0.5 text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
          >
            Next →
          </button>
        </span>
      </div>
    </div>
  );
}

interface HexLine {
  offset: string;
  hex: string;
  ascii: string;
}

function formatHexLines(slice: Uint8Array, startOffset: number): HexLine[] {
  const out: HexLine[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, Math.min(slice.length, i + 16));
    const offset = (startOffset + i).toString(16).padStart(8, '0');
    const hexParts: string[] = [];
    let ascii = '';
    for (let j = 0; j < 16; j++) {
      if (j < chunk.length) {
        const b = chunk[j]!;
        hexParts.push(b.toString(16).padStart(2, '0'));
        ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
        ascii += ' ';
      }
      if (j === 7) hexParts.push('');
    }
    out.push({ offset, hex: hexParts.join(' '), ascii });
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

function guessExtension(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/bmp') return 'bmp';
  if (mime === 'image/x-icon') return 'ico';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/zip') return 'zip';
  if (mime === 'application/gzip') return 'gz';
  if (mime === 'text/plain') return 'txt';
  return 'bin';
}

/** Lowercase-hex encoder for a `Uint8Array`. Symmetric with
 *  {@link decodeHex} so the round-trip preserves bytes exactly. */
function toHexString(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/** Serialises an editor draft into bytes. The Text tab encodes the
 *  textarea body as UTF-8; the Hex tab strips whitespace and parses
 *  the remainder, surfacing a clear error if the hex is malformed. */
type Serialised =
  | { kind: 'ok'; bytes: Uint8Array }
  | { kind: 'err'; message: string };
function serialiseDraft(tab: Tab, text: string, hex: string): Serialised {
  if (tab === 'text') {
    return { kind: 'ok', bytes: new TextEncoder().encode(text) };
  }
  if (tab === 'hex') {
    const sanitized = hex.replace(/\s+/g, '');
    if (sanitized.length === 0) {
      return { kind: 'ok', bytes: new Uint8Array(0) };
    }
    if (sanitized.length % 2 !== 0) {
      return { kind: 'err', message: 'Hex input must have an even number of digits.' };
    }
    if (!/^[0-9a-fA-F]+$/.test(sanitized)) {
      return { kind: 'err', message: 'Hex input contains non-hexadecimal characters.' };
    }
    try {
      return { kind: 'ok', bytes: decodeHex(sanitized) };
    } catch (err) {
      return {
        kind: 'err',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { kind: 'err', message: 'Switch to the Text or Hex tab to edit.' };
}

function HexEditPane({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      placeholder="Paste raw hex (e.g. 48656c6c6f). Whitespace is ignored."
      className="h-full w-full resize-none bg-canvas p-4 font-mono text-[12px] leading-[1.45] text-fg outline-none placeholder:text-fg-subtle"
    />
  );
}

function TextEditPane({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="h-full w-full resize-none bg-canvas p-4 font-mono text-[12px] text-fg outline-none"
    />
  );
}
