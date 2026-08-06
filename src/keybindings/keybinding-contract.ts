/**
 * Keybinding-contribution contract (I5.1).
 *
 * Both shell editions (desktop + web) historically each owned a
 * 40-line `document.addEventListener('keydown')` switch in `App.tsx`
 * that hardcoded the six global combos (?, Cmd-Shift-F, Cmd-K, Cmd-T,
 * Cmd-W, Cmd-S). This contract moves those bindings to the
 * `keybindings` extension point so they can be:
 *
 *   - **Extracted** as a single built-in
 *     (`@plamenix-builtin/default-keybindings`) that registers all six
 *     through the registry with the same closures the shell already
 *     defines (no behaviour change).
 *   - **Extended** by third-party plugins (a "Vim shortcuts" plugin,
 *     an "IBExpert-style F-keys" plugin, etc.) without forking the
 *     shell.
 *   - **Overridden** by user customisations once a Settings panel for
 *     "Customise shortcut" lands (post-M1 — but the registry is
 *     primed to support it).
 *
 * Combo grammar (matches the CodeMirror / vscode flavour the shell
 * already documents in its cheat sheet):
 *
 *   - `Mod+K` — `Cmd` on macOS, `Ctrl` everywhere else (matches what
 *     the existing shell handlers do via `e.metaKey || e.ctrlKey`).
 *   - `Cmd+K` — `Cmd` always (only fires on macOS).
 *   - `Ctrl+K` — `Ctrl` always.
 *   - `Shift+K`, `Alt+K`, `Meta+K` — explicit modifier flags.
 *   - Single-key tokens for everything else: `?`, `F5`, `Escape`,
 *     `ArrowDown`, etc. Letter keys are matched case-insensitively
 *     against `event.key.toLowerCase()`; named keys (`F5`, `Escape`)
 *     match exactly. Letters spelled bare (no modifier prefix) only
 *     fire when no modifier is held — `?` is treated as `Shift+/` on
 *     a US layout but the shell historically reads it through
 *     `e.key === '?'` and that's preserved here.
 *
 * Conflict resolution: contributions are matched in registry
 * priority order. The first contribution whose combo matches AND
 * whose `when` predicate (if any) returns true gets to run; if its
 * `run` returns `true` the event is claimed and dispatch stops, if
 * it returns `false` / `undefined` the next matching contribution
 * gets a turn. Combined with `usePluginContributions` priority sort
 * this lets a higher-priority plugin replace a built-in's behaviour
 * for the same combo without unregistering it.
 */

import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Context handed to a keybinding's `when` predicate + `run` callback. */
export interface KeybindingContext {
  /** The raw keyboard event. The dispatcher already called
   *  `preventDefault()` when a matching contribution claimed it — `run`
   *  receives the event for inspection (`event.shiftKey`, etc.) but
   *  must not call `preventDefault()` itself for the claim semantics. */
  event: KeyboardEvent;
  /** Active focus target at the moment the key fired. */
  target: EventTarget | null;
  /** `true` when focus is inside an `<input>` / `<textarea>` /
   *  `contenteditable` host — `useGlobalKeybindings` populates this via
   *  the same `isTypingTarget` helper the legacy shell handlers used.
   *  Most `?`-style single-letter bindings gate on `!isTyping`. */
  isTyping: boolean;
  /** Whether the runtime is macOS (Cmd vs Ctrl distinction). Computed
   *  once at hook-mount time so the matcher doesn't have to re-derive
   *  it on every keystroke. */
  isMac: boolean;
}

export interface KeybindingContributionPayload {
  /** Human-readable label shown in the Cheat-Sheet modal + any future
   *  "Customise shortcut" UI (e.g. `'Open command palette'`). Required
   *  even though `useGlobalKeybindings` itself doesn't render it —
   *  Cheat-Sheet + accessibility tooling consume it. */
  label: string;
  /** Combo string in the grammar described at the top of this file. */
  combo: string;
  /** Optional guard. When provided, the binding only fires if this
   *  returns `true`. Common patterns:
   *
   *    when: (ctx) => !ctx.isTyping       // gate single-letter combos
   *    when: (ctx) => ctx.event.shiftKey  // disambiguate variants
   */
  when?: (ctx: KeybindingContext) => boolean;
  /** Invoked when the combo matches + `when` passes. Returning `true`
   *  claims the event (the dispatcher calls `preventDefault` + stops
   *  trying other contributions). Returning `false` / `undefined` lets
   *  the next matching contribution try — useful for "soft" bindings
   *  that only conditionally fire (e.g. save profile only when the
   *  active tab actually has a saveable draft). */
  run: (ctx: KeybindingContext) => boolean | void;
}

/** Resolved keybinding ready for dispatch — payload fields plus the
 *  parsed combo cached for fast per-keystroke matching. */
export interface KeybindingDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id do not collide. */
  id: string;
  pluginId: string;
  label: string;
  combo: string;
  parsed: ParsedCombo;
  when: ((ctx: KeybindingContext) => boolean) | null;
  run: (ctx: KeybindingContext) => boolean | void;
}

/** A keybinding combo decomposed into match-ready flags + key token.
 *  Exposed (`parseCombo` + `matchesCombo`) so plugin authors can unit-
 *  test their own combos without re-implementing the grammar. */
export interface ParsedCombo {
  /** When `true`, the combo requires `Cmd` on macOS or `Ctrl` elsewhere.
   *  Mutually exclusive with `cmd` / `ctrl`. */
  mod: boolean;
  /** Requires the actual `Cmd` key (macOS-only). */
  cmd: boolean;
  /** Requires `Ctrl` exactly. */
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** The non-modifier key. Lower-cased for letters; preserved for
   *  named keys (`F5`, `Escape`, `ArrowDown`, `?`). */
  key: string;
  /** Original combo string, retained for diagnostics. */
  source: string;
}

/** Splits a combo string into its match-ready shape. Throws on
 *  malformed combos — fail-loud at registration time beats failing
 *  silently when the user presses the key. */
export function parseCombo(combo: string): ParsedCombo {
  if (typeof combo !== 'string' || combo.length === 0) {
    throw new Error(`keybinding combo must be a non-empty string, got ${JSON.stringify(combo)}`);
  }
  const parts = combo.split('+').map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) {
    throw new Error(`keybinding combo "${combo}" contains an empty segment`);
  }
  const key = parts.pop()!;
  const out: ParsedCombo = {
    mod: false,
    cmd: false,
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: normaliseKey(key),
    source: combo,
  };
  for (const raw of parts) {
    const tok = raw.toLowerCase();
    switch (tok) {
      case 'mod':
        out.mod = true;
        break;
      case 'cmd':
      case 'command':
        out.cmd = true;
        break;
      case 'ctrl':
      case 'control':
        out.ctrl = true;
        break;
      case 'shift':
        out.shift = true;
        break;
      case 'alt':
      case 'option':
        out.alt = true;
        break;
      case 'meta':
      case 'win':
      case 'super':
        out.meta = true;
        break;
      default:
        throw new Error(
          `keybinding combo "${combo}" has unknown modifier "${raw}"`,
        );
    }
  }
  if (out.mod && (out.cmd || out.ctrl)) {
    throw new Error(
      `keybinding combo "${combo}" mixes Mod with Cmd / Ctrl — choose one`,
    );
  }
  return out;
}

function normaliseKey(key: string): string {
  // Single ASCII letters are case-insensitive — store lower-case so
  // matching against `event.key.toLowerCase()` is symmetric. Multi-
  // char names (F5, Escape, ArrowDown) and punctuation (`?`, `,`) are
  // preserved verbatim — they round-trip through `event.key` exactly.
  if (key.length === 1 && /[A-Za-z]/.test(key)) return key.toLowerCase();
  return key;
}

/** Returns `true` when a keyboard event matches the parsed combo. */
export function matchesCombo(parsed: ParsedCombo, e: KeyboardEvent, isMac: boolean): boolean {
  const modWanted = parsed.mod ? (isMac ? 'cmd' : 'ctrl') : null;
  const cmdRequired = parsed.cmd || modWanted === 'cmd';
  const ctrlRequired = parsed.ctrl || modWanted === 'ctrl';
  if (cmdRequired && !e.metaKey) return false;
  if (!cmdRequired && e.metaKey && !parsed.meta) return false;
  if (ctrlRequired && !e.ctrlKey) return false;
  if (!ctrlRequired && e.ctrlKey) return false;
  if (parsed.shift && !e.shiftKey) return false;
  if (!parsed.shift && e.shiftKey && !comboNeedsShift(parsed.key)) return false;
  if (parsed.alt && !e.altKey) return false;
  if (!parsed.alt && e.altKey) return false;
  if (parsed.meta && !cmdRequired && !e.metaKey) return false;
  const evKey =
    parsed.key.length === 1 && /[a-z]/i.test(parsed.key) ? e.key.toLowerCase() : e.key;
  return evKey === parsed.key;
}

/** Some keys (`?` on US layouts) require `Shift` to type but the
 *  shell's combo grammar represents them by the resulting character
 *  rather than `Shift+/`. When the parsed combo references such a
 *  character we allow the shift flag to pass through unchecked. */
function comboNeedsShift(key: string): boolean {
  if (key.length !== 1) return false;
  return /[~!@#$%^&*()_+{}|:"<>?]/.test(key);
}

/** Maps registry contributions into a list of dispatch-ready
 *  descriptors with parsed combos cached. Drops contributions whose
 *  combos failed to parse (the error surfaces through the host's log
 *  sink so plugin authors can debug) rather than blowing up the whole
 *  dispatcher. */
export function pluginContributionsToKeybindings(
  contributions: ReadonlyArray<PluginContribution<KeybindingContributionPayload>>,
  onError: (pluginId: string, contribId: string, err: unknown) => void = () => {},
): KeybindingDescriptor[] {
  const out: KeybindingDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    let parsed: ParsedCombo;
    try {
      parsed = parseCombo(contribution.payload.combo);
    } catch (err) {
      onError(pluginId, contribution.id, err);
      continue;
    }
    out.push({
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: contribution.payload.label,
      combo: contribution.payload.combo,
      parsed,
      when: contribution.payload.when ?? null,
      run: contribution.payload.run,
    });
  }
  return out;
}
