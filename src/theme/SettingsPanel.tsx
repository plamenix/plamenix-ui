import { useEffect, useRef, useState } from 'react';
import { ACCENT_COLORS, type AccentId } from './accent-colors';
import { useThemeStore } from './theme-store';

export interface SettingsPanelProps {
  /** Optional anchor for positioning. The popover defaults to top-right
   *  of the viewport when omitted. */
  anchor?: { right?: number; top?: number };
  onClose: () => void;
}

/**
 * Floating settings popover with theme + accent + sidebar controls.
 *
 * Driven entirely by `useThemeStore`; the host opens / closes it
 * (typically from a gear button in the top bar) but does not mediate
 * state.
 */
export function SettingsPanel({ anchor, onClose }: SettingsPanelProps) {
  const mode = useThemeStore((s) => s.mode);
  const accent = useThemeStore((s) => s.accent);
  const sidebarCollapsed = useThemeStore((s) => s.sidebarCollapsed);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setSidebarCollapsed = useThemeStore((s) => s.setSidebarCollapsed);

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Settings"
      className="fixed z-50 w-72 rounded border border-edge bg-elevated p-4 text-fg shadow-lg"
      style={{ top: `${anchor?.top ?? 48}px`, right: `${anchor?.right ?? 12}px` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Appearance</h2>
        <button
          type="button"
          className="text-xs text-fg-subtle hover:text-fg"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <section className="mb-4">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-fg-subtle">Theme</p>
        <div className="flex gap-2">
          <ModeButton
            label="Light"
            active={mode === 'light'}
            onClick={() => setMode('light')}
          />
          <ModeButton label="Dark" active={mode === 'dark'} onClick={() => setMode('dark')} />
        </div>
      </section>

      <section className="mb-4">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-fg-subtle">Accent</p>
        <AccentGrid current={accent} onPick={setAccent} mode={mode} />
      </section>

      <section>
        <label className="flex items-center justify-between text-xs text-fg-muted">
          <span>Collapse schema sidebar</span>
          <input
            type="checkbox"
            checked={sidebarCollapsed}
            onChange={(e) => setSidebarCollapsed(e.target.checked)}
          />
        </label>
      </section>
    </div>
  );
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded border px-2 py-1 text-xs ${
        active
          ? 'border-accent bg-accent-subtle text-fg'
          : 'border-edge text-fg-muted hover:bg-panel'
      }`}
    >
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
    <div className="grid grid-cols-5 gap-1.5">
      {ACCENT_COLORS.map((c) => {
        const swatch = mode === 'dark' ? c.swatchDark : c.swatchLight;
        const active = current === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            className={`h-7 w-full rounded border ${
              active ? 'border-fg' : 'border-edge hover:border-fg-subtle'
            }`}
            style={{ backgroundColor: swatch }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={active}
          />
        );
      })}
    </div>
  );
}

/**
 * Small gear button consumers can drop next to the tab strip or in a
 * header to open the panel. Keeps the open/close state local; the
 * panel itself is portaled via fixed positioning.
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-edge px-2 py-0.5 text-xs text-fg-muted hover:bg-panel"
        aria-label="Settings"
        aria-expanded={open}
      >
        ⚙
      </button>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
