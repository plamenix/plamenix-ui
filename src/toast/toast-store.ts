import { create } from 'zustand';

/** Discriminated toast payload. New kinds get a new variant so the
 *  viewport can render each consistently without an open-ended
 *  `string` content channel. */
export type Toast =
  | {
      id: string;
      kind: 'mutation';
      /** Human-readable headline (e.g. "UPDATE · 3 rows · 12 ms"). */
      title: string;
      /** Actual SQL the engine ran. Surfaced verbatim so the user can
       *  copy or open it in the editor. */
      sql: string;
      /** Wall-clock duration reported by the execute path. */
      durationMs: number;
      /** Rows affected when the result was `Affected`. `undefined` for
       *  selectable statements (e.g. `EXECUTE BLOCK … RETURNS`). */
      affectedRows?: number | undefined;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'mutation-batch';
      title: string;
      /** All mutation statements; joined for the "Open in Editor"
       *  button so the user lands on the same multi-statement script. */
      statements: { sql: string; durationMs: number; affectedRows?: number | undefined }[];
      totalDurationMs: number;
      createdAt: number;
    }
  | {
      id: string;
      /** A short confirmation with no statement behind it — a copy
       *  that worked, or one that could not. Separate from `mutation`
       *  because nothing here ran against the database, so the
       *  viewport must not offer "Open in Editor" for it. */
      kind: 'notice';
      title: string;
      tone: 'success' | 'error';
      createdAt: number;
    };

/** Toast variant minus the bits the store fills in (`id`,
 *  `createdAt`). Splits the union manually so the discriminated
 *  narrowing survives — `Omit<Toast, …>` over a union collapses
 *  variant-specific fields into a single shape. */
export type ToastInput =
  | Omit<Extract<Toast, { kind: 'mutation' }>, 'id' | 'createdAt'>
  | Omit<Extract<Toast, { kind: 'mutation-batch' }>, 'id' | 'createdAt'>
  | Omit<Extract<Toast, { kind: 'notice' }>, 'id' | 'createdAt'>;

export interface ToastStoreActions {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export type ToastStore = {
  toasts: Toast[];
} & ToastStoreActions;

/** How long a toast stays mounted before auto-dismiss kicks in. */
export const TOAST_TTL_MS = 6000;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}-${counter}`;
}

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: (input) => {
    const id = nextId();
    const toast: Toast = {
      id,
      createdAt: Date.now(),
      ...input,
    } as Toast;
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        const present = get().toasts.some((t) => t.id === id);
        if (present) get().dismiss(id);
      }, TOAST_TTL_MS);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
