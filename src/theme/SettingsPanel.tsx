import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Code2,
  Columns,
  CornerDownLeft,
  Download,
  Droplet,
  FileCode,
  History,
  Indent,
  Lightbulb,
  ListOrdered,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PlugZap,
  Rows,
  Settings,
  Slash,
  SlidersHorizontal,
  Sun,
  Table2,
  TextCursorInput,
  WrapText,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ACCENT_COLORS, type AccentId } from './accent-colors';
import { useResolvedThemeMode, useThemeStore } from './theme-store';
import {
  useEditorStore,
  type EditorFontSize,
  type EditorTabSize,
} from '../db/editor-store';
import {
  useDisplayStore,
  type CsvDelimiter,
  type DateFormat,
  type ExportFormat,
} from '../db/display-store';
import { PAGE_SIZE_OPTIONS } from '../db/pagination';
import { useConnectionPrefs, type QueryHistoryLimit } from '../db/connection-prefs';
import { useTabsStore } from '../db/tabs-store';
import { downloadSettings } from '../settings-io';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Opens the full-page detailed settings view. When omitted, the
   *  drawer footer's "Detailed settings" button is hidden. */
  onOpenDetailed?: () => void;
}

/**
 * Slide-in quick settings drawer. Shows the elementary controls
 * (theme + accent) for fast access. Deeper preferences (editor,
 * results, exports, etc.) live behind the `Detailed settings` footer
 * button, which opens the full settings page.
 *
 * Driven entirely by `useThemeStore`; the host opens / closes it
 * (typically from the Settings button in the top bar) but does not
 * mediate state.
 */
export function SettingsPanel({ open, onClose, onOpenDetailed }: SettingsPanelProps) {
  const mode = useThemeStore((s) => s.mode);
  const resolvedMode = useResolvedThemeMode();
  const accent = useThemeStore((s) => s.accent);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      aria-hidden={!open}
      className={`fixed inset-0 z-[60] ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-[min(28rem,95vw)] flex-col overflow-hidden border-l border-edge bg-panel shadow-[-12px_0_40px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-5 py-3">
          <Settings className="h-4 w-4 text-accent" />
          <div className="flex-1">
            <h2 className="text-[13px] font-semibold text-fg">Settings</h2>
            <p className="text-[10px] text-fg-subtle">Theme · accent</p>
          </div>
          <button
            type="button"
            onClick={() => downloadSettings()}
            aria-label="Export settings"
            title="Export settings as JSON"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Theme
          </p>
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-edge bg-inset p-1">
            <ModeButton
              label="System"
              icon={Monitor}
              active={mode === 'system'}
              onClick={() => setMode('system')}
            />
            <ModeButton
              label="Light"
              icon={Sun}
              active={mode === 'light'}
              onClick={() => setMode('light')}
            />
            <ModeButton
              label="Dark"
              icon={Moon}
              active={mode === 'dark'}
              onClick={() => setMode('dark')}
            />
          </div>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Accent
          </p>
          <AccentGrid current={accent} onPick={setAccent} mode={resolvedMode} />
        </section>
        </div>

        {onOpenDetailed && (
          <footer className="border-t border-edge bg-canvas px-5 py-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDetailed();
              }}
              className="group flex w-full items-center justify-between gap-2 rounded-md border border-edge bg-inset px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-elevated"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
                Detailed settings
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function CsvDelimiterRow({
  value,
  onChange,
}: {
  value: CsvDelimiter;
  onChange: (next: CsvDelimiter) => void;
}) {
  const options: { id: CsvDelimiter; label: string; hint: string }[] = [
    { id: ',', label: ',', hint: 'comma' },
    { id: ';', label: ';', hint: 'semicolon' },
    { id: '\t', label: 'TAB', hint: 'tab' },
  ];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <Columns className="h-3.5 w-3.5 text-fg-subtle" />
        CSV delimiter
      </span>
      <div className="flex shrink-0 items-center gap-1 rounded-md border border-edge bg-canvas p-0.5">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              title={opt.hint}
              className={`min-w-[2.25rem] rounded px-2 py-0.5 text-[11px] font-mono font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted shadow-sm'
                  : 'text-fg-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DefaultExportRow({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange: (next: ExportFormat) => void;
}) {
  const options: { id: ExportFormat; label: string }[] = [
    { id: 'csv', label: 'CSV' },
    { id: 'json', label: 'JSON' },
    { id: 'xlsx', label: 'XLSX' },
    { id: 'sql', label: 'SQL' },
    { id: 'xml', label: 'XML' },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <Download className="h-3.5 w-3.5 text-fg-subtle" />
        Default export
      </span>
      <div className="grid grid-cols-5 gap-1">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`rounded px-1.5 py-1 text-[10px] font-mono font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted shadow-sm'
                  : 'bg-canvas text-fg-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-fg-subtle">
        Default format leads the toolbar with accent highlight. Other formats
        stay one click away.
      </p>
    </div>
  );
}

function ExportIncludeDdlRow({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ToggleRow
        icon={FileCode}
        label="SQL export: include CREATE TABLE"
        checked={value}
        onChange={onChange}
      />
      <p className="px-3 text-[10px] text-fg-subtle">
        When off, SQL export emits only INSERT statements. Honoured by the
        per-result SQL button and the client-side database export; the
        server-streamed SQL path still emits DDL.
      </p>
    </div>
  );
}

function QueryHistoryLimitRow({
  value,
  onChange,
}: {
  value: QueryHistoryLimit;
  onChange: (next: QueryHistoryLimit) => void;
}) {
  const options: { id: QueryHistoryLimit; label: string }[] = [
    { id: 100, label: '100' },
    { id: 500, label: '500' },
    { id: 2000, label: '2k' },
    { id: 'unlimited', label: '∞' },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <History className="h-3.5 w-3.5 text-fg-subtle" />
        Query history retention
      </span>
      <div className="grid grid-cols-4 gap-1">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={String(opt.id)}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`rounded px-2 py-1 text-[11px] font-mono font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted shadow-sm'
                  : 'bg-canvas text-fg-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-fg-subtle">
        Per-profile cap on persisted entries. When the limit is reached,
        oldest entries are trimmed on the next execute. ∞ keeps every
        entry until you manually clear the history.
      </p>
    </div>
  );
}

function PageSizeRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <Rows className="h-3.5 w-3.5 text-fg-subtle" />
        Default page size
      </span>
      <div className="grid grid-cols-7 gap-1">
        {PAGE_SIZE_OPTIONS.map((n) => {
          const active = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={active}
              className={`rounded px-1 py-1 text-[10px] font-mono font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted shadow-sm'
                  : 'bg-canvas text-fg-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-fg-subtle">
        Applied to new result tabs. Existing tabs keep their current size
        until you pick a new one from the footer dropdown.
      </p>
    </div>
  );
}

function DateFormatRow({
  value,
  onChange,
}: {
  value: DateFormat;
  onChange: (next: DateFormat) => void;
}) {
  const options: { id: DateFormat; label: string; sample: string }[] = [
    { id: 'iso', label: 'ISO', sample: '2026-05-12 14:32:00' },
    { id: 'eu', label: 'EU', sample: '12.05.2026 14:32:00' },
    { id: 'us', label: 'US', sample: '05/12/2026 14:32:00' },
    { id: 'relative', label: 'Relative', sample: '5m ago' },
  ];
  const current = options.find((o) => o.id === value) ?? options[0]!;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <CalendarClock className="h-3.5 w-3.5 text-fg-subtle" />
        Date format
      </span>
      <div className="grid grid-cols-4 gap-1">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted shadow-sm'
                  : 'bg-canvas text-fg-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[10px] text-fg-subtle">{current.sample}</p>
    </div>
  );
}

function NullDisplayRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const presets: { label: string; value: string }[] = [
    { label: 'NULL', value: 'NULL' },
    { label: '∅', value: '∅' },
    { label: 'blank', value: '' },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-inset px-3 py-2">
      <label className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          <Slash className="h-3.5 w-3.5 text-fg-subtle" />
          NULL display
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={32}
          placeholder="(blank)"
          className="w-24 rounded border border-edge bg-canvas px-2 py-1 text-right font-mono text-xs text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </label>
      <div className="flex items-center gap-1">
        {presets.map((p) => {
          const active = p.value === value;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              aria-pressed={active}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted'
                  : 'text-fg-subtle hover:bg-elevated hover:text-fg'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-fg-subtle">
        Affects on-screen result cells only. Exports follow their own format
        (CSV blank, JSON null, SQL INSERT literal NULL).
      </p>
    </div>
  );
}

function SegmentRow<T extends string | number>({
  icon: Icon,
  label,
  value,
  options,
  onChange,
  formatOption,
}: {
  icon: typeof Sun;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  formatOption: (v: T) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <Icon className="h-3.5 w-3.5 text-fg-subtle" />
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-1 rounded-md border border-edge bg-canvas p-0.5">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={String(opt)}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={active}
              className={`min-w-[1.75rem] rounded px-1.5 py-0.5 text-[11px] font-mono font-medium transition-colors ${
                active
                  ? 'bg-accent text-fg-inverted shadow-sm'
                  : 'text-fg-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              {formatOption(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Sun;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-panel text-fg shadow-sm ring-1 ring-edge'
          : 'text-fg-muted hover:bg-panel/60 hover:text-fg'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function AccentGrid({
  current,
  onPick,
  mode,
}: {
  current: AccentId;
  onPick: (id: AccentId) => void;
  mode: 'dark' | 'light';
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {ACCENT_COLORS.map((c) => {
        const swatch = mode === 'dark' ? c.swatchDark : c.swatchLight;
        const active = current === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            title={c.name}
            aria-label={c.name}
            aria-pressed={active}
            className={`group relative flex h-9 w-full items-center justify-center rounded-lg transition-all hover:scale-105 ${
              active ? 'ring-2 ring-fg ring-offset-2 ring-offset-panel' : ''
            }`}
            style={{ backgroundColor: swatch }}
          >
            {active && (
              <Check
                className="h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]"
                strokeWidth={3}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Sun;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-edge bg-inset px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        <Icon className="h-3.5 w-3.5 text-fg-subtle" />
        {label}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="h-5 w-9 rounded-full bg-elevated transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-fg-inverted shadow transition-transform peer-checked:translate-x-4"
        />
      </span>
    </label>
  );
}

/**
 * Small gear button consumers can drop next to the tab strip or in a
 * header to open the panel. Keeps the open/close state local; the
 * panel itself is portaled via fixed positioning.
 *
 * Carries an embedded global-activity indicator: a pulsing accent dot
 * in the top-right corner whenever any tab has `busy === true`. Hover
 * surfaces a multiline tooltip listing the busy tab titles. Purely
 * additive — the gear still functions as before.
 */
export interface SettingsButtonProps {
  /** Opens the full-page detailed settings view. Passed through to the
   *  drawer's footer "Detailed settings" button. */
  onOpenDetailed?: () => void;
}

export function SettingsButton({ onOpenDetailed }: SettingsButtonProps = {}) {
  const [open, setOpen] = useState(false);
  const tabs = useTabsStore((s) => s.tabs);
  const busyTabs = tabs.filter((t) => t.busy);
  const buttonTitle =
    busyTabs.length > 0
      ? `Settings — ${busyTabs.length} busy tab${busyTabs.length === 1 ? '' : 's'}:\n${busyTabs
          .map((t) => `• ${t.title}`)
          .join('\n')}`
      : 'Settings';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={buttonTitle}
        aria-expanded={open}
        title={buttonTitle}
        className="relative flex self-stretch items-center gap-1.5 px-3 text-xs font-medium text-fg-subtle transition-colors hover:bg-panel hover:text-fg"
      >
        <Settings className="h-3.5 w-3.5" />
        <span>Settings</span>
        {busyTabs.length > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1 top-1 inline-flex h-2 w-2"
          >
            <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        )}
      </button>
      <SettingsPanel
        open={open}
        onClose={() => setOpen(false)}
        {...(onOpenDetailed ? { onOpenDetailed } : {})}
      />
    </>
  );
}

export interface SettingsPageProps {
  onClose: () => void;
  /** Label for the top-left back button. Defaults to "Back". */
  backLabel?: string;
}

/**
 * Full-page settings view. Hosts every preference (theme, accent,
 * layout, connection, history, editor, results, exports). Used in two
 * places: rendered in the content pane while authenticated, and as a
 * standalone page replacing the connection screen when unauthenticated.
 *
 * The drawer (`SettingsPanel`) intentionally shows only the elementary
 * controls; this page is where the full set lives.
 */
export function SettingsPage({ onClose, backLabel = 'Back' }: SettingsPageProps) {
  const mode = useThemeStore((s) => s.mode);
  const resolvedMode = useResolvedThemeMode();
  const accent = useThemeStore((s) => s.accent);
  const sidebarCollapsed = useThemeStore((s) => s.sidebarCollapsed);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setSidebarCollapsed = useThemeStore((s) => s.setSidebarCollapsed);
  const fontSize = useEditorStore((s) => s.fontSize);
  const editorLineNumbers = useEditorStore((s) => s.lineNumbers);
  const lineWrap = useEditorStore((s) => s.lineWrap);
  const tabSize = useEditorStore((s) => s.tabSize);
  const submitOnModEnter = useEditorStore((s) => s.submitOnModEnter);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const setLineNumbers = useEditorStore((s) => s.setLineNumbers);
  const setLineWrap = useEditorStore((s) => s.setLineWrap);
  const setTabSize = useEditorStore((s) => s.setTabSize);
  const setSubmitOnModEnter = useEditorStore((s) => s.setSubmitOnModEnter);
  const nullDisplay = useDisplayStore((s) => s.nullDisplay);
  const setNullDisplay = useDisplayStore((s) => s.setNullDisplay);
  const dateFormat = useDisplayStore((s) => s.dateFormat);
  const setDateFormat = useDisplayStore((s) => s.setDateFormat);
  const defaultPageSize = useDisplayStore((s) => s.defaultPageSize);
  const setDefaultPageSize = useDisplayStore((s) => s.setDefaultPageSize);
  const csvDelimiter = useDisplayStore((s) => s.csvDelimiter);
  const setCsvDelimiter = useDisplayStore((s) => s.setCsvDelimiter);
  const defaultExportFormat = useDisplayStore((s) => s.defaultExportFormat);
  const setDefaultExportFormat = useDisplayStore((s) => s.setDefaultExportFormat);
  const exportIncludeDdl = useDisplayStore((s) => s.exportIncludeDdl);
  const setExportIncludeDdl = useDisplayStore((s) => s.setExportIncludeDdl);
  const showWelcomeTips = useDisplayStore((s) => s.showWelcomeTips);
  const setShowWelcomeTips = useDisplayStore((s) => s.setShowWelcomeTips);
  const autoReconnect = useConnectionPrefs((s) => s.autoReconnect);
  const setAutoReconnect = useConnectionPrefs((s) => s.setAutoReconnect);
  const queryHistoryLimit = useConnectionPrefs((s) => s.queryHistoryLimit);
  const setQueryHistoryLimit = useConnectionPrefs((s) => s.setQueryHistoryLimit);

  const sections: Array<{
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    body: ReactNode;
  }> = [
    {
      id: 'theme',
      title: 'Theme',
      description: 'Pick the colour mode. System tracks your OS preference.',
      icon: Palette,
      body: (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-edge bg-inset p-1">
          <ModeButton
            label="System"
            icon={Monitor}
            active={mode === 'system'}
            onClick={() => setMode('system')}
          />
          <ModeButton
            label="Light"
            icon={Sun}
            active={mode === 'light'}
            onClick={() => setMode('light')}
          />
          <ModeButton
            label="Dark"
            icon={Moon}
            active={mode === 'dark'}
            onClick={() => setMode('dark')}
          />
        </div>
      ),
    },
    {
      id: 'accent',
      title: 'Accent',
      description: 'Highlight colour used by buttons, focus rings and the tab strip.',
      icon: Droplet,
      body: <AccentGrid current={accent} onPick={setAccent} mode={resolvedMode} />,
    },
    {
      id: 'layout',
      title: 'Layout',
      description: 'Workspace chrome.',
      icon: PanelLeftClose,
      body: (
        <ToggleRow
          icon={PanelLeftClose}
          label="Collapse schema sidebar"
          checked={sidebarCollapsed}
          onChange={setSidebarCollapsed}
        />
      ),
    },
    {
      id: 'connection',
      title: 'Connection',
      description: 'How connection sessions behave.',
      icon: PlugZap,
      body: (
        <ToggleRow
          icon={PlugZap}
          label="Auto-reconnect on disconnect"
          checked={autoReconnect}
          onChange={setAutoReconnect}
        />
      ),
    },
    {
      id: 'history',
      title: 'History',
      description: 'Query history retention per profile.',
      icon: History,
      body: <QueryHistoryLimitRow value={queryHistoryLimit} onChange={setQueryHistoryLimit} />,
    },
    {
      id: 'editor',
      title: 'Editor',
      description: 'SQL editor typography, indent + keymap.',
      icon: Code2,
      body: (
        <div className="flex flex-col gap-2">
          <SegmentRow<EditorFontSize>
            icon={TextCursorInput}
            label="Font size"
            value={fontSize}
            options={[12, 13, 14, 15, 16]}
            onChange={setFontSize}
            formatOption={(v) => `${v}`}
          />
          <SegmentRow<EditorTabSize>
            icon={Indent}
            label="Tab size"
            value={tabSize}
            options={[2, 4]}
            onChange={setTabSize}
            formatOption={(v) => `${v}`}
          />
          <ToggleRow
            icon={ListOrdered}
            label="Line numbers"
            checked={editorLineNumbers}
            onChange={setLineNumbers}
          />
          <ToggleRow
            icon={WrapText}
            label="Word wrap"
            checked={lineWrap}
            onChange={setLineWrap}
          />
          <ToggleRow
            icon={CornerDownLeft}
            label="⌘/Ctrl+Enter runs query"
            checked={submitOnModEnter}
            onChange={setSubmitOnModEnter}
          />
        </div>
      ),
    },
    {
      id: 'results',
      title: 'Results',
      description: 'How rows are rendered in the result table + welcome dashboard.',
      icon: Table2,
      body: (
        <div className="flex flex-col gap-2">
          <NullDisplayRow value={nullDisplay} onChange={setNullDisplay} />
          <DateFormatRow value={dateFormat} onChange={setDateFormat} />
          <PageSizeRow value={defaultPageSize} onChange={setDefaultPageSize} />
          <ToggleRow
            icon={Lightbulb}
            label="Show Firebird tips on Welcome"
            checked={showWelcomeTips}
            onChange={setShowWelcomeTips}
          />
        </div>
      ),
    },
    {
      id: 'exports',
      title: 'Exports',
      description: 'Default formatting for CSV / SQL / JSON dumps.',
      icon: FileCode,
      body: (
        <div className="flex flex-col gap-2">
          <CsvDelimiterRow value={csvDelimiter} onChange={setCsvDelimiter} />
          <DefaultExportRow
            value={defaultExportFormat}
            onChange={setDefaultExportFormat}
          />
          <ExportIncludeDdlRow value={exportIncludeDdl} onChange={setExportIncludeDdl} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-canvas">
      {/* Hero header. Back button + Export framed by a gradient strip
          tinted with the active accent so the page reads as its own
          surface, not just another modal. */}
      <header className="relative shrink-0 overflow-hidden border-b border-edge bg-panel">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        />
        <div className="flex items-center gap-3 px-6 pt-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => downloadSettings()}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            title="Export settings as JSON"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
        <div className="flex items-end gap-3 px-6 pb-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/30">
            <Settings className="h-5 w-5" />
          </span>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold leading-tight text-fg">Settings</h1>
            <p className="text-xs text-fg-subtle">
              Tune theme, accent, editor, results, history, exports and more.
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SettingsNav sections={sections.map(({ id, title, icon }) => ({ id, title, icon }))} />
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {sections.map((s) => (
              <PageSection
                key={s.id}
                id={s.id}
                title={s.title}
                description={s.description}
                icon={s.icon}
              >
                {s.body}
              </PageSection>
            ))}
            <p className="pt-4 text-center text-[10px] text-fg-subtle">
              Need a quick toggle? The drawer in the top bar (⚙) covers theme + accent at a
              glance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageSection({
  id,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section
      id={`settings-section-${id}`}
      className="group relative scroll-mt-24 overflow-hidden rounded-xl border border-edge bg-panel transition-shadow hover:shadow-[0_4px_18px_rgba(0,0,0,0.18)]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-accent/0 via-accent/60 to-accent/0 opacity-0 transition-opacity group-hover:opacity-100"
      />
      <header className="flex items-start gap-3 border-b border-edge bg-inset/40 px-5 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-inset ring-accent/25">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
          <p className="text-[11px] text-fg-subtle">{description}</p>
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Sticky left-rail navigation. Click jumps to the section; the active
 *  entry is detected via IntersectionObserver. Hidden below `md` so the
 *  page collapses to a single column on narrow viewports. */
function SettingsNav({
  sections,
}: {
  sections: Array<{ id: string; title: string; icon: LucideIcon }>;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (top?.target.id) {
          const id = top.target.id.replace('settings-section-', '');
          setActive(id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const s of sections) {
      const el = document.getElementById(`settings-section-${s.id}`);
      if (el) obs.observe(el);
    }
    observerRef.current = obs;
    return () => {
      obs.disconnect();
      observerRef.current = null;
    };
  }, [sections]);

  const jump = (id: string) => {
    const el = document.getElementById(`settings-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(id);
    }
  };

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-edge bg-inset/60 px-3 py-6 md:flex">
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        Sections
      </p>
      {sections.map((s) => {
        const Icon = s.icon;
        const isActive = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
              isActive
                ? 'bg-canvas text-fg ring-1 ring-edge'
                : 'text-fg-muted hover:bg-elevated hover:text-fg'
            }`}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-accent"
              />
            )}
            <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-accent' : 'text-fg-subtle'}`} />
            {s.title}
          </button>
        );
      })}
    </aside>
  );
}
