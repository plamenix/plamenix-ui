/**
 * Tiny platform-detection helper shared between cheat-sheet rendering,
 * command-palette labels, and any other surface that wants to print the
 * platform-appropriate modifier glyph.
 *
 * `navigator.platform` is technically deprecated but every current
 * browser still populates it and the alternatives (`userAgentData`,
 * UA-CH) are not universally available yet. Stick with `platform`
 * until that changes.
 */

/** True when the host runs on a macOS/iOS-flavoured device. Returns
 *  `false` in non-DOM contexts (SSR, unit tests). */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform ?? '';
  return /Mac|iPhone|iPad/.test(platform);
}

/** Returns the platform-appropriate primary modifier label: `'⌘'` on
 *  Mac, `'Ctrl'` everywhere else. */
export function getModKeyLabel(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

/** Returns the platform-appropriate alt-modifier label. Mac uses `'⌥'`
 *  (Option); other platforms use `'Alt'`. */
export function getAltKeyLabel(): string {
  return isMac() ? '⌥' : 'Alt';
}

/** Returns the shift-modifier label. Mac shows the glyph; other
 *  platforms get the word for clarity. */
export function getShiftKeyLabel(): string {
  return isMac() ? '⇧' : 'Shift';
}

/** True when the DOM-focused element is a text-entry target — input,
 *  textarea, contenteditable host, or CodeMirror. Used by global
 *  hotkey listeners that should not fire while the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // CodeMirror renders inside a `.cm-content[contenteditable]`; the
  // check above already covers it, but plugins may stamp other
  // editable surfaces — fall back to the ancestor walk for safety.
  return target.closest('[contenteditable="true"]') !== null;
}
