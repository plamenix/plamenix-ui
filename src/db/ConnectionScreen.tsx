import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Server,
  Star,
  Trash2,
} from 'lucide-react';
import type { ConnectionForm, Profile } from './types';

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
  onChange: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void;
  onProfileNameChange: (value: string) => void;
  onSelectProfile: (id: string | null) => void;
  onSaveProfile: () => void;
  onDeleteProfile: (id: string) => void;
  onQuickConnect: (id: string) => void;
  onSubmit: () => void;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-edge bg-inset px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const LABEL_CLASS =
  'mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-muted';

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
  onChange,
  onProfileNameChange,
  onSelectProfile,
  onSaveProfile,
  onDeleteProfile,
  onQuickConnect,
  onSubmit,
}: ConnectionScreenProps) {
  const [search, setSearch] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.host.toLowerCase().includes(q) ||
        p.database.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        String(p.port).includes(q),
    );
  }, [profiles, search]);

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
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-canvas p-6">
      <div className="grid w-full max-w-[900px] grid-cols-[40%_60%] overflow-hidden rounded-2xl border border-edge bg-panel shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        {/* Left: saved profiles */}
        <div className="relative overflow-hidden rounded-l-2xl border-r border-edge bg-canvas">
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
                                className={`truncate text-[13px] font-semibold ${
                                  isActive ? 'text-accent' : 'text-fg'
                                }`}
                              >
                                {p.name}
                              </div>
                              <div className="truncate font-mono text-[12px] font-medium text-fg-muted">
                                {dbName || 'No database'}
                              </div>
                              <div className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
                                {p.user}@{p.host}:{p.port}
                              </div>
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
          </div>
        </div>

        {/* Right: connect form */}
        <div className="flex flex-col bg-panel">
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col p-6">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-subtle">
                <Database className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-fg">
                  Plamenix <span className="text-accent">Firebird IDE</span>
                </h1>
                <p className="text-xs text-fg-muted">Enter connection details</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 whitespace-pre-wrap rounded-lg border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

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
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={LABEL_CLASS}>Host</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => onChange('host', e.target.value)}
                    className={INPUT_CLASS}
                    required
                  />
                </div>
                <div className="w-[88px]">
                  <label className={LABEL_CLASS}>Port</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => onChange('port', Number(e.target.value))}
                    className={INPUT_CLASS}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={LABEL_CLASS}>Username</label>
                  <input
                    type="text"
                    value={form.user}
                    onChange={(e) => onChange('user', e.target.value)}
                    className={INPUT_CLASS}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className={LABEL_CLASS}>Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => onChange('password', e.target.value)}
                      className={`${INPUT_CLASS} pr-9`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors hover:text-fg-muted"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {passwordHint && (
                    <p className="mt-1 text-[10px] text-fg-subtle">{passwordHint}</p>
                  )}
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Database Path or Alias</label>
                <input
                  type="text"
                  value={form.database}
                  onChange={(e) => onChange('database', e.target.value)}
                  placeholder="/path/to/database.fdb or alias"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  Encryption Key{' '}
                  <span className="font-normal normal-case text-fg-subtle">(optional)</span>
                </label>
                <input
                  type="password"
                  value={form.encryptionKey}
                  onChange={(e) => onChange('encryptionKey', e.target.value)}
                  placeholder="Leave empty for unencrypted databases"
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
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
                    className="accent-[var(--color-accent)]"
                  />
                  Pure-Rust mode
                </label>
              </div>
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

        <div className="col-span-2 flex items-center justify-between rounded-b-2xl border-t border-edge bg-canvas px-6 py-3">
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
      </div>
    </div>
  );
}
