import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Database,
  Eye,
  EyeOff,
  FileUp,
  Folder,
  FolderOpen,
  ListTree,
  Loader2,
  Search,
  Server,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { BrandIcon } from '../BrandIcon';
import { ErrorBanner } from './ErrorBanner';
import { ACCENT_COLORS, type AccentId } from '../theme/accent-colors';
import { useResolvedThemeMode } from '../theme/theme-store';
import { applySettings, parseSettings } from '../settings-io';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pluginContributionsToAuthProviders,
  type AuthProviderContributionPayload,
  type AuthProviderFormContext,
} from '../auth/auth-provider-contract';
import type {
  ConnectionForm,
  ListAliasesResult,
  Profile,
  TestConnectionResult,
} from './types';
import { SUPPORTED_CHARSETS } from './types';

/** Props for {@link ConnectionScreen}. The component is purely
 *  presentational — every form value, profile list, and handler is
 *  supplied by the host. */
export interface ConnectionScreenProps {
  form: ConnectionForm;
  profileName: string;
  busy: boolean;
  error: string | null;
  profiles: Profile[];
  selectedProfileId: string | null;
  /** Optional helper text under the password field. */
  passwordHint?: string;
  /** True while a test-connection request is in flight. */
  testing?: boolean;
  /** Latest test-connection outcome (null = not tested yet). */
  testResult?: TestConnectionResult | null;
  /** Currently chosen profile colour (accent id) for the in-progress
   *  draft. Mirrors {@link Profile.color}. `null` means "no tint". */
  profileColor?: string | null;
  onChange: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void;
  onProfileNameChange: (value: string) => void;
  onProfileColorChange?: (color: string | null) => void;
  onSelectProfile: (id: string | null) => void;
  onSaveProfile: () => void;
  onDeleteProfile: (id: string) => void;
  onQuickConnect: (id: string) => void;
  onSubmit: () => void;
  /** Fired when the user clicks the Test Connection link. Omit to hide
   *  the button entirely. */
  onTest?: () => void;
  /** Cached result from `db_list_aliases`. Pass `null` until the user
   *  opens the popover for the first time; the host triggers the load
   *  on demand through {@link ConnectionScreenProps.onListAliases}. */
  aliasesData?: ListAliasesResult | null;
  /** True while a `db_list_aliases` request is in flight. */
  aliasesLoading?: boolean;
  /** Fired when the user opens the aliases popover. Omit to hide the
   *  aliases button entirely. */
  onListAliases?: () => void;
  /** Opens the host's native file picker for the fbclient library and
   *  resolves with the absolute path the user chose, or `null` when
   *  they cancel. Web edition omits this and only ships the text
   *  input. */
  onBrowseFbclient?: () => Promise<string | null>;
  /** Opens a native file picker filtered to `.fdb` and returns the
   *  selected path, or `null` when the user cancels. Surfaces in
   *  embedded mode as a Browse button next to the database field. */
  onBrowseDatabase?: () => Promise<string | null>;
  /** Fetches the Firebird client library for the host platform and
   *  the supplied version label (e.g. `"5.0.3"`). Resolves with the
   *  installed path. `version === undefined` means "latest known
   *  release". */
  onDownloadFbclient?: (version?: string) => Promise<string>;
  /** Versions the downloader knows how to fetch. Renders a small
   *  select next to the Download button. Pass `null` / omit to hide
   *  the picker (web edition has no downloader). */
  fbclientReleases?: { version: string }[] | null;
  /** Opens a directory picker for an IBSurgeon EPF library bundle
   *  and inspects it for the required trio (fbclient, fbcrypt,
   *  OpenSSL). Resolves with `null` when the user cancels. */
  onBrowseFbclientDir?: () => Promise<{
    fbclientPath: string | null;
    hasFbcrypt: boolean;
    hasOpenssl: boolean;
  } | null>;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-edge bg-inset px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const LABEL_CLASS =
  'mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-muted';

/** Pill for the EPF-folder status row. Green tick when found, amber
 *  shield when not. */
function EpfChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono ${
        ok
          ? 'border-success/30 bg-success-subtle text-success'
          : 'border-warning/30 bg-warning-subtle text-warning'
      }`}
    >
      {ok ? (
        <ShieldCheck className="h-2.5 w-2.5" />
      ) : (
        <ShieldAlert className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  );
}

/** Renders an epoch-ms timestamp as a short relative-time string,
 *  e.g. `'just now'`, `'5m ago'`, `'3d ago'`. `0` is treated as
 *  "unknown" and returns the empty string so older profile files
 *  without timestamps render as a silent line. */
function formatRelativeMs(ms: number): string {
  if (ms <= 0) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  if (diff < 365 * 86_400_000) return `${Math.floor(diff / (30 * 86_400_000))}mo ago`;
  return `${Math.floor(diff / (365 * 86_400_000))}y ago`;
}

/** Returns the newer of `lastUsedAt` / `lastDisconnectedAt`, or `null`
 *  when neither has ever been stamped. */
function mostRecentTouch(profile: Profile): number | null {
  const used = profile.lastUsedAt ?? 0;
  const disc = profile.lastDisconnectedAt ?? 0;
  const max = Math.max(used, disc);
  return max > 0 ? max : null;
}

/** Builds the relative-time label shown on a profile row. Picks the
 *  more recent of the two stamps and prefixes it with `Used` /
 *  `Disconnected`. Returns the empty string when neither stamp is
 *  present. */
function mostRecentTouchLabel(profile: Profile): string {
  const used = profile.lastUsedAt ?? 0;
  const disc = profile.lastDisconnectedAt ?? 0;
  if (used === 0 && disc === 0) return '';
  if (disc > used) return `Disconnected ${formatRelativeMs(disc)}`;
  return `Used ${formatRelativeMs(used)}`;
}

/**
 * Two-pane connection screen: saved profiles on the left, manual
 * connect form on the right. Both editions inject the full handler
 * surface — the component holds nothing but local UI state (password
 * visibility + search filter).
 */
export function ConnectionScreen({
  form,
  profileName,
  busy,
  error,
  profiles,
  selectedProfileId,
  passwordHint,
  testing = false,
  testResult = null,
  aliasesData = null,
  aliasesLoading = false,
  profileColor = null,
  onChange,
  onProfileNameChange,
  onProfileColorChange,
  onSelectProfile,
  onSaveProfile,
  onDeleteProfile,
  onQuickConnect,
  onSubmit,
  onTest,
  onListAliases,
  onBrowseFbclient,
  onBrowseDatabase,
  onDownloadFbclient,
  fbclientReleases = null,
  onBrowseFbclientDir,
}: ConnectionScreenProps) {
  const [search, setSearch] = useState('');
  const [profileModeTab, setProfileModeTab] = useState<'server' | 'embedded'>(
    'server',
  );
  // Keep the profile filter tab in sync with the form's mode so the
  // list shows relevant profiles when the user toggles the mode tabs
  // at the top of the form.
  useEffect(() => {
    setProfileModeTab(form.embedded ? 'embedded' : 'server');
  }, [form.embedded]);
  const [showEncKey, setShowEncKey] = useState(false);

  // I5.7 — register the built-in password auth provider through the
  // shared registry. Single mount per ConnectionScreen render cycle;
  // teardown on unmount.

  const authProviderContributions =
    usePluginContributions<AuthProviderContributionPayload>('auth_providers');
  const authProviders = useMemo(
    () => pluginContributionsToAuthProviders(authProviderContributions),
    [authProviderContributions],
  );
  const [activeAuthProviderId, setActiveAuthProviderId] = useState<string | null>(null);
  const resolvedAuthProviderId =
    activeAuthProviderId && authProviders.some((p) => p.id === activeAuthProviderId)
      ? activeAuthProviderId
      : authProviders[0]?.id ?? null;
  const activeAuthProvider =
    authProviders.find((p) => p.id === resolvedAuthProviderId) ?? null;
  const authFormCtx = useMemo<AuthProviderFormContext>(() => {
    const ctx: AuthProviderFormContext = { form, onChange, busy };
    if (passwordHint !== undefined) ctx.passwordHint = passwordHint;
    return ctx;
  }, [form, onChange, busy, passwordHint]);
  const [aliasOpen, setAliasOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Surfaces a small "N changed" hint on the Advanced button so the
  // user knows the drawer hides non-default state without having to
  // open it. Counts every advanced field that drifts from its zero
  // value; Pure-Rust is the only boolean here.
  const advancedTouched =
    (form.encryptionKey.trim().length > 0 ? 1 : 0) +
    (form.encryptionRequired ? 1 : 0) +
    (form.pureRust ? 1 : 0) +
    (form.fbclientPath.trim().length > 0 ? 1 : 0) +
    (form.charset && form.charset !== 'UTF8' ? 1 : 0);
  useEffect(() => {
    if (!advancedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAdvancedOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [advancedOpen]);
  const [fbclientBusy, setFbclientBusy] = useState<
    'browse' | 'browse-dir' | 'download' | null
  >(null);
  const [fbclientError, setFbclientError] = useState<string | null>(null);
  const [epfStatus, setEpfStatus] = useState<{
    hasFbcrypt: boolean;
    hasOpenssl: boolean;
  } | null>(null);
  const [fbclientVersion, setFbclientVersion] = useState<string>(
    fbclientReleases?.[0]?.version ?? '',
  );
  useEffect(() => {
    if (
      fbclientReleases &&
      fbclientReleases.length > 0 &&
      !fbclientReleases.some((r) => r.version === fbclientVersion)
    ) {
      setFbclientVersion(fbclientReleases[0]?.version ?? '');
    }
  }, [fbclientReleases, fbclientVersion]);
  const aliasPopRef = useRef<HTMLDivElement | null>(null);
  const aliasBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!aliasOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (
        (aliasPopRef.current && aliasPopRef.current.contains(t)) ||
        (aliasBtnRef.current && aliasBtnRef.current.contains(t))
      ) {
        return;
      }
      setAliasOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAliasOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [aliasOpen]);

  const openAliases = () => {
    if (!onListAliases) return;
    setAliasOpen(true);
    if (aliasesData === null && !aliasesLoading) onListAliases();
  };

  const profileCounts = useMemo(() => {
    let server = 0;
    let embedded = 0;
    for (const p of profiles) {
      if (p.embedded) embedded += 1;
      else server += 1;
    }
    return { server, embedded };
  }, [profiles]);
  const filtered = useMemo(() => {
    const inMode = profiles.filter((p) =>
      profileModeTab === 'embedded' ? p.embedded === true : !p.embedded,
    );
    const base = !search
      ? inMode
      : inMode.filter((p) => {
          const q = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.host.toLowerCase().includes(q) ||
            p.database.toLowerCase().includes(q) ||
            p.user.toLowerCase().includes(q) ||
            String(p.port).includes(q)
          );
        });
    // Most-recently-touched first — uses the newer of `lastUsedAt`
    // and `lastDisconnectedAt` so a profile the user just disconnected
    // bubbles up alongside one they just connected. Falls back to
    // createdAt when neither stamp is set.
    return [...base].sort((a, b) => {
      const ta = mostRecentTouch(a) ?? a.createdAt ?? 0;
      const tb = mostRecentTouch(b) ?? b.createdAt ?? 0;
      return tb - ta;
    });
  }, [profiles, search, profileModeTab]);

  const isCurrentSaved = profiles.some(
    (p) =>
      p.host === form.host &&
      p.port === form.port &&
      p.database === form.database &&
      p.user === form.user,
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
      <div className="grid flex-1 grid-cols-[40%_60%] overflow-hidden bg-panel">
        {/* Left: saved profiles */}
        <div className="relative overflow-hidden border-r border-edge bg-canvas">
          <div className="absolute inset-0 flex flex-col overflow-hidden">
            <div className="px-6 pb-4 pt-6">
              <h2 className="mb-1 text-sm font-semibold text-fg">Saved Connections</h2>
              <p className="text-xs text-fg-subtle">Click to load into the form</p>
            </div>

            {profiles.length > 0 && (
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
                  <input
                    type="text"
                    placeholder="Search profiles…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-edge bg-inset py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div
                  role="tablist"
                  aria-label="Profile mode filter"
                  className="mt-2 flex gap-1 rounded-lg border border-edge bg-inset p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={profileModeTab === 'server'}
                    onClick={() => setProfileModeTab('server')}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      profileModeTab === 'server'
                        ? 'bg-accent text-canvas shadow-sm'
                        : 'text-fg-subtle hover:bg-elevated hover:text-fg'
                    }`}
                  >
                    Server
                    <span className="ml-1 font-mono text-[9px] opacity-70">
                      {profileCounts.server}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={profileModeTab === 'embedded'}
                    onClick={() => setProfileModeTab('embedded')}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      profileModeTab === 'embedded'
                        ? 'bg-accent text-canvas shadow-sm'
                        : 'text-fg-subtle hover:bg-elevated hover:text-fg'
                    }`}
                  >
                    Embedded
                    <span className="ml-1 font-mono text-[9px] opacity-70">
                      {profileCounts.embedded}
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {profiles.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated">
                    <Server className="h-6 w-6 text-fg-subtle" />
                  </div>
                  <p className="mb-1 text-sm font-medium text-fg-muted">No saved profiles</p>
                  <p className="text-xs leading-relaxed text-fg-subtle">
                    Connect to a database and save it for quick access next time
                  </p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((p) => {
                    const isActive = p.id === selectedProfileId;
                    const dbName = p.database.split(/[\\/]/).pop() ?? p.database;
                    return (
                      <li key={p.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectProfile(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectProfile(p.id);
                            }
                          }}
                          className={`group cursor-pointer rounded-xl p-3 transition-all ${
                            isActive
                              ? 'bg-accent-subtle ring-1 ring-accent/30'
                              : 'hover:bg-elevated'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                isActive ? 'bg-accent-subtle' : 'bg-elevated'
                              }`}
                            >
                              <Database
                                className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-fg-subtle'}`}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className={`flex items-center gap-1.5 truncate text-[13px] font-semibold ${
                                  isActive ? 'text-accent' : 'text-fg'
                                }`}
                              >
                                {p.color && (
                                  <span
                                    aria-hidden
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor:
                                        ACCENT_COLORS.find((c) => c.id === p.color)?.swatchDark ??
                                        p.color,
                                    }}
                                  />
                                )}
                                <span className="truncate">{p.name}</span>
                              </div>
                              <div className="truncate font-mono text-[12px] font-medium text-fg-muted">
                                {dbName || 'No database'}
                              </div>
                              <div className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
                                {p.user}@{p.host}:{p.port}
                              </div>
                              {(() => {
                                const label = mostRecentTouchLabel(p);
                                if (label) {
                                  return (
                                    <div className="mt-0.5 truncate text-[10px] text-fg-subtle">
                                      {label}
                                    </div>
                                  );
                                }
                                if (p.createdAt) {
                                  return (
                                    <div className="mt-0.5 truncate text-[10px] text-fg-subtle">
                                      Created {formatRelativeMs(p.createdAt)}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                title="Connect now"
                                disabled={busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickConnect(p.id);
                                }}
                                className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-accent-subtle hover:text-accent disabled:opacity-40"
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Remove"
                                disabled={busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteProfile(p.id);
                                }}
                                className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <ImportSettingsFooter />
          </div>
        </div>

        {/* Right: connect form */}
        <div className="flex flex-col overflow-y-auto bg-panel">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-[640px] flex-col px-8 py-8"
          >
            <div className="mb-7 flex items-center gap-3">
              <BrandIcon className="h-10 w-10" title="Plamenix" />
              <div>
                <h1 className="text-lg font-semibold text-fg">
                  Plamenix <span className="text-accent">Firebird IDE</span>
                </h1>
                <p className="text-xs text-fg-muted">Enter connection details</p>
              </div>
            </div>

            {error && (
              <div className="mb-4">
                <ErrorBanner error={error} compact />
              </div>
            )}

            <div
              role="tablist"
              aria-label="Connection mode"
              className="mb-4 flex gap-1 rounded-lg border border-edge bg-canvas p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!form.embedded}
                onClick={() => onChange('embedded', false)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  !form.embedded
                    ? 'bg-accent text-canvas shadow-sm'
                    : 'text-fg-subtle hover:bg-elevated hover:text-fg'
                }`}
              >
                Server mode
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={form.embedded}
                onClick={() => {
                  onChange('embedded', true);
                  onChange('pureRust', false);
                }}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  form.embedded
                    ? 'bg-accent text-canvas shadow-sm'
                    : 'text-fg-subtle hover:bg-elevated hover:text-fg'
                }`}
                title="Attach via Firebird's embedded engine — exclusive local file access, no host/port/password needed"
              >
                Embedded mode
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className={LABEL_CLASS}>
                  Profile Name{' '}
                  <span className="font-normal normal-case text-fg-subtle">(for save)</span>
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => onProfileNameChange(e.target.value)}
                  placeholder="e.g. Production DB, Local Dev…"
                  className={INPUT_CLASS}
                />
                {onProfileColorChange && (
                  <ColorPicker value={profileColor ?? null} onChange={onProfileColorChange} />
                )}
              </div>

              <div className="flex gap-3">
                {!form.embedded && (
                  <>
                    <div className="w-[240px] shrink-0">
                      <label className={LABEL_CLASS}>Host</label>
                      <input
                        type="text"
                        value={form.host}
                        onChange={(e) => onChange('host', e.target.value)}
                        className={INPUT_CLASS}
                        required
                      />
                    </div>
                    <div className="w-[88px] shrink-0">
                      <label className={LABEL_CLASS}>Port</label>
                      <input
                        type="number"
                        value={form.port}
                        onChange={(e) => onChange('port', Number(e.target.value))}
                        className={INPUT_CLASS}
                        required
                      />
                    </div>
                  </>
                )}
                <div className="min-w-0 flex-1">
                  <label className={LABEL_CLASS}>
                    Charset{' '}
                    <span className="font-normal normal-case text-fg-subtle">(wire)</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.charset}
                      onChange={(e) => onChange('charset', e.target.value)}
                      className={`${INPUT_CLASS} appearance-none pr-9`}
                      title="Wire-protocol encoding"
                    >
                      {SUPPORTED_CHARSETS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                    />
                  </div>
                </div>
              </div>

              {/* I5.7 — auth provider tabs (only render when >1
                  provider registered) + the active provider's
                  FormComponent in place of the legacy inline
                  Username/Password block. The built-in password
                  provider renders the same pre-I5.7 markup with the
                  show/hide toggle, so the single-provider case is
                  visually identical to the pre-section layout. */}
              {authProviders.length > 1 && (
                <div
                  role="tablist"
                  aria-label="Authentication method"
                  className="flex items-center gap-1 border-b border-edge"
                >
                  {authProviders.map((p) => {
                    const active = p.id === resolvedAuthProviderId;
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveAuthProviderId(p.id)}
                        className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-accent text-accent'
                            : 'border-transparent text-fg-muted hover:text-fg'
                        }`}
                      >
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {activeAuthProvider && (
                <activeAuthProvider.FormComponent ctx={authFormCtx} />
              )}
              {form.embedded && (
                <div className="rounded-md border border-edge bg-canvas px-3 py-2.5 text-[11px] text-fg-muted">
                  <span className="font-semibold text-fg">Embedded mode:</span>{' '}
                  attaches via Firebird's in-process engine using the{' '}
                  <span className="font-mono">.fdb</span> file directly.
                  Username is honored (recorded in{' '}
                  <span className="font-mono">MON$ATTACHMENTS</span>);
                  whether the password is enforced depends on the
                  engine's <span className="font-mono">AuthServer</span>{' '}
                  config in <span className="font-mono">firebird.conf</span>.
                </div>
              )}

              {!form.embedded && onTest && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onTest}
                    disabled={testing || busy || !form.host}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:opacity-40"
                  >
                    {testing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Test Connection
                  </button>
                  {testResult && !testing && (
                    <span
                      className={`flex items-center gap-1.5 text-xs ${
                        testResult.ok ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="truncate">
                        {testResult.ok
                          ? `Connected — Firebird ${testResult.firebirdVersion ?? '?'} (${testResult.durationMs} ms)`
                          : testResult.error}
                      </span>
                    </span>
                  )}
                </div>
              )}

              <div className="relative">
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                    {form.embedded ? 'Database File' : 'Database Path or Alias'}
                  </label>
                  {!form.embedded && onListAliases && (
                    <button
                      ref={aliasBtnRef}
                      type="button"
                      onClick={() => (aliasOpen ? setAliasOpen(false) : openAliases())}
                      className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:text-accent"
                      title="Browse databases.conf aliases"
                    >
                      <ListTree className="h-3 w-3" />
                      Aliases
                    </button>
                  )}
                </div>
                {form.embedded && onBrowseDatabase ? (
                  <div className="flex">
                    <input
                      type="text"
                      value={form.database}
                      onChange={(e) => onChange('database', e.target.value)}
                      placeholder="/Users/you/databases/my.fdb"
                      className={`${INPUT_CLASS} rounded-r-none border-r-0 font-mono text-[12px]`}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const picked = await onBrowseDatabase();
                        if (picked) onChange('database', picked);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-r-md border border-edge bg-elevated px-3 text-xs font-medium text-fg-muted transition-colors hover:bg-panel hover:text-fg"
                      title="Pick a .fdb file from disk"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Browse
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.database}
                    onChange={(e) => onChange('database', e.target.value)}
                    placeholder="/path/to/database.fdb or alias"
                    className={INPUT_CLASS}
                  />
                )}
                {aliasOpen && (
                  <div
                    ref={aliasPopRef}
                    role="dialog"
                    aria-label="databases.conf aliases"
                    className="absolute right-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-lg border border-edge bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
                  >
                    <header className="flex items-center justify-between border-b border-edge bg-canvas px-3 py-2">
                      <div className="flex items-center gap-2 text-[11px] text-fg-muted">
                        <ListTree className="h-3 w-3 text-fg-subtle" />
                        <span className="font-semibold">databases.conf</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAliasOpen(false)}
                        aria-label="Close aliases"
                        className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </header>
                    {aliasesData?.sourcePath && (
                      <div
                        className="truncate border-b border-edge bg-inset px-3 py-1.5 font-mono text-[10px] text-fg-subtle"
                        title={aliasesData.sourcePath}
                      >
                        {aliasesData.sourcePath}
                      </div>
                    )}
                    <div className="max-h-60 overflow-y-auto py-1">
                      {aliasesLoading ? (
                        <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-fg-subtle">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Reading databases.conf…
                        </div>
                      ) : !aliasesData || aliasesData.aliases.length === 0 ? (
                        <p className="px-3 py-5 text-center text-xs text-fg-subtle">
                          {aliasesData?.sourcePath
                            ? 'No aliases defined.'
                            : 'No databases.conf found on this host.'}
                        </p>
                      ) : (
                        aliasesData.aliases.map((a) => (
                          <button
                            key={a.alias}
                            type="button"
                            onClick={() => {
                              onChange('database', a.alias);
                              setAliasOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated"
                          >
                            <Database className="h-3 w-3 shrink-0 text-fg-subtle" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-[12px] text-fg">
                                {a.alias}
                              </div>
                              <div
                                className="truncate font-mono text-[10px] text-fg-subtle"
                                title={a.path}
                              >
                                {a.path}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAdvancedOpen(true)}
                className="group flex w-full items-center gap-3 rounded-lg border border-edge bg-canvas px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-elevated"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">
                  <span className="block text-[12px] font-semibold text-fg">Advanced settings</span>
                  <span className="block truncate text-[10px] text-fg-subtle">
                    Encryption · Pure-Rust · fbclient · charset
                    {advancedTouched > 0 && (
                      <span className="ml-1 text-accent">· {advancedTouched} changed</span>
                    )}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
              </button>
            </div>

            <div className="mt-5 flex gap-2 border-t border-edge pt-4">
              <button
                type="button"
                title={isCurrentSaved ? 'Profile saved' : 'Save profile'}
                onClick={onSaveProfile}
                disabled={busy || profileName.trim() === ''}
                className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
                  isCurrentSaved
                    ? 'border-accent/30 bg-accent-subtle text-accent'
                    : 'border-edge text-fg-muted hover:bg-elevated hover:text-fg'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${isCurrentSaved ? 'fill-current' : ''}`} />
                <span className="text-xs">{isCurrentSaved ? 'Saved' : 'Save'}</span>
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      {/* Bottom attribution strip — spans full width below both panels. */}
      <div className="flex shrink-0 items-center justify-between border-t border-edge bg-canvas px-6 py-3">
        <span className="text-[11px] text-fg-subtle">
          © {new Date().getFullYear()} Zlatan Omerović ·{' '}
          <a
            href="https://github.com/ZlatanOmerovic"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-accent"
          >
            Ascent Systèmes
          </a>
        </span>
        <span className="font-mono text-[11px] text-fg-subtle">v1.0.0-beta</span>
      </div>

      {/* Slide-in advanced settings drawer.
          Backdrop dims the screen + closes on click. Panel slides in from
          right at 28rem wide; full viewport height. Hosts the encryption
          key, encryption flags, fbclient picker, and charset selector. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Advanced connection settings"
        aria-hidden={!advancedOpen}
        className={`fixed inset-0 z-[60] ${
          advancedOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          onClick={() => setAdvancedOpen(false)}
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
            advancedOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          className={`absolute right-0 top-0 flex h-full w-[min(28rem,95vw)] flex-col overflow-hidden border-l border-edge bg-panel shadow-[-12px_0_40px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${
            advancedOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <header className="flex items-center gap-2 border-b border-edge bg-canvas px-5 py-3">
            <SlidersHorizontal className="h-4 w-4 text-accent" />
            <div className="flex-1">
              <h2 className="text-[13px] font-semibold text-fg">Advanced settings</h2>
              <p className="text-[10px] text-fg-subtle">
                Encryption · driver mode · fbclient · charset
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdvancedOpen(false)}
              aria-label="Close advanced settings"
              className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div>
              <label className={LABEL_CLASS}>
                Encryption Key{' '}
                <span className="font-normal normal-case text-fg-subtle">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showEncKey ? 'text' : 'password'}
                  value={form.encryptionKey}
                  onChange={(e) => onChange('encryptionKey', e.target.value)}
                  placeholder="Leave empty for unencrypted databases"
                  className={`${INPUT_CLASS} pr-9`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowEncKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors hover:text-fg-muted"
                  aria-label={showEncKey ? 'Hide encryption key' : 'Show encryption key'}
                >
                  {showEncKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={form.encryptionRequired}
                  onChange={(e) => onChange('encryptionRequired', e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                Require encryption
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={form.pureRust}
                  onChange={(e) => onChange('pureRust', e.target.checked)}
                  disabled={form.embedded}
                  className="accent-[var(--color-accent)] disabled:opacity-50"
                  title={
                    form.embedded
                      ? 'Embedded mode is native-only; pure-Rust cannot use the embedded engine.'
                      : undefined
                  }
                />
                Pure-Rust mode
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className={LABEL_CLASS}>
                  fbclient library{' '}
                  <span className="font-normal normal-case text-fg-subtle">
                    (optional, native mode)
                  </span>
                </label>
                <input
                  value={form.fbclientPath}
                  onChange={(e) => onChange('fbclientPath', e.target.value)}
                  placeholder="/opt/firebird/lib/libfbclient.dylib"
                  disabled={form.pureRust}
                  spellCheck={false}
                  className={`${INPUT_CLASS} disabled:opacity-50 font-mono text-[12px]`}
                />
              </div>

              {(onBrowseFbclient || onBrowseFbclientDir) && (
                <div className="grid grid-cols-2 gap-2">
                  {onBrowseFbclient && (
                    <button
                      type="button"
                      title="Browse for fbclient library file"
                      aria-label="Browse for fbclient library file"
                      disabled={form.pureRust || fbclientBusy !== null}
                      onClick={async () => {
                        setFbclientError(null);
                        setEpfStatus(null);
                        setFbclientBusy('browse');
                        try {
                          const path = await onBrowseFbclient();
                          if (path) onChange('fbclientPath', path);
                        } catch (err) {
                          setFbclientError(String(err));
                        } finally {
                          setFbclientBusy(null);
                        }
                      }}
                      className="group flex flex-col items-start gap-1 rounded-lg border border-edge bg-inset p-3 text-left text-xs transition-colors hover:border-accent/40 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-fg">
                        {fbclientBusy === 'browse' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        ) : (
                          <FolderOpen className="h-3.5 w-3.5 text-accent" />
                        )}
                        Browse file
                      </span>
                      <span className="text-[10px] leading-snug text-fg-subtle">
                        Pick a single libfbclient binary
                      </span>
                    </button>
                  )}
                  {onBrowseFbclientDir && (
                    <button
                      type="button"
                      title="Pick an IBSurgeon EPF directory (fbclient + fbcrypt + OpenSSL)"
                      aria-label="Pick EPF library directory"
                      disabled={form.pureRust || fbclientBusy !== null}
                      onClick={async () => {
                        setFbclientError(null);
                        setEpfStatus(null);
                        setFbclientBusy('browse-dir');
                        try {
                          const res = await onBrowseFbclientDir();
                          if (res) {
                            if (res.fbclientPath) {
                              onChange('fbclientPath', res.fbclientPath);
                            }
                            setEpfStatus({
                              hasFbcrypt: res.hasFbcrypt,
                              hasOpenssl: res.hasOpenssl,
                            });
                            if (!res.fbclientPath) {
                              setFbclientError('No fbclient found in that directory.');
                            }
                          }
                        } catch (err) {
                          setFbclientError(String(err));
                        } finally {
                          setFbclientBusy(null);
                        }
                      }}
                      className="group flex flex-col items-start gap-1 rounded-lg border border-edge bg-inset p-3 text-left text-xs transition-colors hover:border-accent/40 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-fg">
                        {fbclientBusy === 'browse-dir' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        ) : (
                          <Folder className="h-3.5 w-3.5 text-accent" />
                        )}
                        Browse folder
                      </span>
                      <span className="text-[10px] leading-snug text-fg-subtle">
                        Auto-detect EPF triplet
                      </span>
                    </button>
                  )}
                </div>
              )}

              {onDownloadFbclient && (
                <div className="rounded-lg border border-edge bg-inset p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-fg">
                      <CloudDownload className="h-3.5 w-3.5 text-accent" />
                      Official release
                    </span>
                    {fbclientReleases && fbclientReleases.length > 1 ? (
                      <select
                        value={fbclientVersion}
                        onChange={(e) => setFbclientVersion(e.target.value)}
                        disabled={form.pureRust || fbclientBusy !== null}
                        title="Firebird major version to download"
                        aria-label="Firebird version"
                        className="h-7 shrink-0 rounded-md border border-edge bg-canvas px-2 text-[11px] text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {fbclientReleases.map((r) => (
                          <option key={r.version} value={r.version}>
                            Firebird v{r.version}
                          </option>
                        ))}
                      </select>
                    ) : fbclientVersion ? (
                      <span className="text-[11px] text-fg-subtle">
                        Firebird v{fbclientVersion}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-2 text-[10px] leading-snug text-fg-subtle">
                    Downloads the platform-matched libfbclient from the Firebird
                    project and sets the path above.
                  </p>
                  <button
                    type="button"
                    title={`Download Firebird ${fbclientVersion || 'client library'} for this platform`}
                    aria-label="Download Firebird client library"
                    disabled={form.pureRust || fbclientBusy !== null}
                    onClick={async () => {
                      setFbclientError(null);
                      setFbclientBusy('download');
                      try {
                        const path = await onDownloadFbclient(
                          fbclientVersion === '' ? undefined : fbclientVersion,
                        );
                        onChange('fbclientPath', path);
                      } catch (err) {
                        setFbclientError(String(err));
                      } finally {
                        setFbclientBusy(null);
                      }
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {fbclientBusy === 'download' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Downloading…
                      </>
                    ) : (
                      <>
                        <CloudDownload className="h-3.5 w-3.5" />
                        Download client library
                      </>
                    )}
                  </button>
                </div>
              )}

              {fbclientError && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
                  {fbclientError}
                </p>
              )}
              {epfStatus && (
                <div className="rounded-lg border border-edge bg-inset p-3">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                    EPF bundle status
                  </p>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <EpfChip label="fbclient" ok />
                    <EpfChip label="fbcrypt" ok={epfStatus.hasFbcrypt} />
                    <EpfChip label="OpenSSL" ok={epfStatus.hasOpenssl} />
                  </div>
                  {epfStatus.hasFbcrypt && epfStatus.hasOpenssl ? (
                    <p className="text-[10px] text-success">EPF bundle complete.</p>
                  ) : (
                    <p className="text-[10px] text-warning">
                      Missing plugin libraries — encrypted connections may fail.
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>

          <footer className="flex shrink-0 items-center justify-end border-t border-edge bg-canvas px-5 py-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen(false)}
              className="rounded-lg border border-edge px-4 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Done
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}

/** Compact row of accent swatches plus a "no tint" reset chip. Used in
 *  the connect form to tag the profile with a colour the tab strip and
 *  status dot then honour. */
function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const mode = useResolvedThemeMode();
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Tag</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label="No tint"
        title="No tint"
        className={`flex h-4 w-4 items-center justify-center rounded-full border text-[8px] transition-colors ${
          value === null ? 'border-fg text-fg' : 'border-edge text-fg-subtle hover:border-fg-muted'
        }`}
      >
        ∅
      </button>
      {ACCENT_COLORS.map((c) => {
        const selected = value === c.id;
        const swatch = mode === 'dark' ? c.swatchDark : c.swatchLight;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id as AccentId)}
            aria-label={c.name}
            title={c.name}
            className={`h-4 w-4 rounded-full border transition-transform ${
              selected
                ? 'border-fg ring-2 ring-offset-1 ring-offset-panel scale-110'
                : 'border-edge hover:scale-110'
            }`}
            style={{ backgroundColor: swatch }}
          />
        );
      })}
    </div>
  );
}

/**
 * Collapsed-by-default expander for importing a saved settings file.
 * Lives under the saved-profiles column because it's only relevant
 * before the user picks a profile — once connected the in-session
 * Settings panel already offers Export and re-import is a rare op.
 */
function ImportSettingsFooter() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setText('');
    setError(null);
    setApplied(false);
  };

  const handleFile = async (file: File) => {
    setApplied(false);
    setError(null);
    try {
      const body = await file.text();
      setText(body);
      doApply(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const doApply = (body: string) => {
    setError(null);
    setApplied(false);
    const result = parseSettings(body);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applySettings(result.settings);
    setApplied(true);
  };

  return (
    <div className="border-t border-edge px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <FileUp className="h-3 w-3" />
        Import settings…
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-edge bg-canvas px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            <FileUp className="h-3 w-3" />
            Pick file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              // Reset value so picking the same file again still fires.
              e.target.value = '';
            }}
          />
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setApplied(false);
              setError(null);
            }}
            placeholder="…or paste JSON here"
            className="h-24 resize-none rounded-md border border-edge bg-canvas px-2 py-1 font-mono text-[10px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded px-2 py-0.5 text-[10px] text-fg-subtle hover:text-fg"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => doApply(text)}
              disabled={text.trim().length === 0}
              className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          {error && (
            <p className="rounded border border-danger/30 bg-danger-subtle px-2 py-1 text-[10px] text-danger">
              {error}
            </p>
          )}
          {applied && !error && (
            <p className="rounded border border-success/30 bg-success-subtle px-2 py-1 text-[10px] text-success">
              Applied. Theme + editor + display settings updated.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
