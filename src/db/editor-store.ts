import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Font-size options exposed in the Settings UI. Constrained to a
 *  small enum so callers can render a slider/picker without worrying
 *  about arbitrary CSS values landing in the persisted state. */
export type EditorFontSize = 12 | 13 | 14 | 15 | 16;
/** Tab-size options. Firebird code historically uses 2; some teams
 *  prefer 4. Anything else is rare enough to defer. */
export type EditorTabSize = 2 | 4;

export interface EditorState {
  fontSize: EditorFontSize;
  lineNumbers: boolean;
  lineWrap: boolean;
  tabSize: EditorTabSize;
  /** When false, ⌘/Ctrl+Enter inside the SQL editor falls through to
   *  the default key behaviour (newline) and the toolbar "Execute"
   *  button becomes the only way to run a query. */
  submitOnModEnter: boolean;
  setFontSize: (size: EditorFontSize) => void;
  setLineNumbers: (on: boolean) => void;
  setLineWrap: (on: boolean) => void;
  setTabSize: (size: EditorTabSize) => void;
  setSubmitOnModEnter: (on: boolean) => void;
}

const ALLOWED_FONT_SIZES = new Set<EditorFontSize>([12, 13, 14, 15, 16]);
const ALLOWED_TAB_SIZES = new Set<EditorTabSize>([2, 4]);

/**
 * Persisted editor settings shared by every `SqlEditor` instance.
 *
 * Kept distinct from `theme-store` so visual-theme tweaks don't churn
 * editor-only settings and vice versa.
 */
export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      fontSize: 13,
      lineNumbers: true,
      lineWrap: true,
      tabSize: 4,
      submitOnModEnter: true,
      setFontSize: (fontSize) => set({ fontSize }),
      setLineNumbers: (lineNumbers) => set({ lineNumbers }),
      setLineWrap: (lineWrap) => set({ lineWrap }),
      setTabSize: (tabSize) => set({ tabSize }),
      setSubmitOnModEnter: (submitOnModEnter) => set({ submitOnModEnter }),
    }),
    {
      name: 'plamenix.editor',
      version: 1,
      partialize: (s) => ({
        fontSize: s.fontSize,
        lineNumbers: s.lineNumbers,
        lineWrap: s.lineWrap,
        tabSize: s.tabSize,
        submitOnModEnter: s.submitOnModEnter,
      }),
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        if (!ALLOWED_FONT_SIZES.has(rehydrated.fontSize)) rehydrated.fontSize = 13;
        if (!ALLOWED_TAB_SIZES.has(rehydrated.tabSize)) rehydrated.tabSize = 4;
      },
    },
  ),
);
