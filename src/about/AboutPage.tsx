/**
 * Standalone About surface — version, copyright, license, acknowledgments.
 *
 * Attribution copy follows the project convention: footer reads
 * `© <year> Zlatan Omerović · Ascent Systèmes` and links to the
 * author's GitHub. The page never names "Plamenix Contributors" or
 * other generic phrasings.
 */

import { ArrowLeft, ExternalLink, Info } from 'lucide-react';

export interface AboutPageProps {
  /** App version (`1.0.0-beta`, etc.). Surfaces at the top of the
   *  page. */
  version: string;
  /** Fires when the user clicks Back. */
  onClose: () => void;
  /** Optional override of the Back-button label. */
  backLabel?: string;
}

const REPO = 'https://github.com/ZlatanOmerovic/plamenix';
const AUTHOR_GITHUB = 'https://github.com/ZlatanOmerovic';

const ACK: ReadonlyArray<{ name: string; url: string; role: string }> = [
  { name: 'Firebird',     url: 'https://firebirdsql.org',                role: 'Database engine' },
  { name: 'rsfbclient',   url: 'https://github.com/fdb-rs/rsfbclient',   role: 'Rust + native Firebird client' },
  { name: 'Tauri',        url: 'https://tauri.app',                      role: 'Desktop shell framework' },
  { name: 'wasmtime',     url: 'https://wasmtime.dev',                   role: 'Plugin WASM runtime' },
  { name: 'React',        url: 'https://react.dev',                      role: 'UI framework' },
  { name: 'Vite',         url: 'https://vite.dev',                       role: 'Frontend bundler' },
  { name: 'CodeMirror 6', url: 'https://codemirror.net',                 role: 'SQL editor' },
  { name: 'Zustand',      url: 'https://zustand.docs.pmnd.rs',           role: 'State management' },
  { name: 'TanStack Query', url: 'https://tanstack.com/query',           role: 'Server state' },
  { name: 'lucide-react', url: 'https://lucide.dev',                     role: 'Icons' },
];

export function AboutPage({ version, onClose, backLabel = 'Back' }: AboutPageProps) {
  const year = '2026';
  return (
    <div className="flex h-full w-full flex-1 flex-col bg-canvas">
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
        </div>
        <div className="flex items-end gap-3 px-6 pb-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/30">
            <Info className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-fg">About Plamenix</h1>
            <p className="truncate text-xs text-fg-muted">
              Open-source IDE for Firebird databases.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        <section className="rounded-lg border border-edge bg-panel p-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-bold text-fg">Plamenix</h2>
            <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted">
              v{version}
            </span>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            A modern Firebird IDE with a Rust core, WebAssembly plugin
            host, and shared React shell across desktop (Tauri) and web
            (Fastify) editions.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Source on GitHub
              <ExternalLink className="h-3 w-3 text-fg-subtle" />
            </a>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-edge bg-panel p-6">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              Author
            </h3>
            <p className="mt-2 text-sm text-fg">
              ©{' '}
              <a
                href={AUTHOR_GITHUB}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {year} Zlatan Omerović
              </a>{' '}
              · Ascent Systèmes
            </p>
          </div>

          <div className="rounded-lg border border-edge bg-panel p-6">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              License
            </h3>
            <p className="mt-2 text-sm text-fg">
              Dual-licensed under MIT or Apache-2.0.
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Pick whichever terms apply to your use; both ship in the
              repository root.
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-edge bg-panel p-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
            Built with
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ACK.map((a) => (
              <li key={a.name} className="flex items-start gap-2 text-xs">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-accent hover:underline"
                >
                  {a.name}
                  <ExternalLink className="h-2.5 w-2.5 text-fg-subtle" />
                </a>
                <span className="text-fg-subtle">— {a.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
