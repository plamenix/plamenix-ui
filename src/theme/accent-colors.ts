/**
 * The 10 accent colours that ride on top of light/dark themes.
 *
 * Each value matches the matching `.accent-<id>` class in `theme.css`.
 * `swatchLight` / `swatchDark` are the hex values rendered inside the
 * settings picker (so users see the exact tone they will get).
 */
export interface AccentDef {
  id: AccentId;
  name: string;
  swatchLight: string;
  swatchDark: string;
}

export type AccentId =
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'teal'
  | 'cyan';

export const ACCENT_COLORS: readonly AccentDef[] = [
  { id: 'blue', name: 'Blue', swatchLight: '#3b82f6', swatchDark: '#3b82f6' },
  { id: 'indigo', name: 'Indigo', swatchLight: '#6366f1', swatchDark: '#818cf8' },
  { id: 'violet', name: 'Violet', swatchLight: '#8b5cf6', swatchDark: '#a78bfa' },
  { id: 'purple', name: 'Purple', swatchLight: '#a855f7', swatchDark: '#c084fc' },
  { id: 'rose', name: 'Rose', swatchLight: '#f43f5e', swatchDark: '#fb7185' },
  { id: 'orange', name: 'Orange', swatchLight: '#f97316', swatchDark: '#fb923c' },
  { id: 'amber', name: 'Amber', swatchLight: '#d97706', swatchDark: '#fbbf24' },
  { id: 'emerald', name: 'Emerald', swatchLight: '#10b981', swatchDark: '#34d399' },
  { id: 'teal', name: 'Teal', swatchLight: '#14b8a6', swatchDark: '#2dd4bf' },
  { id: 'cyan', name: 'Cyan', swatchLight: '#06b6d4', swatchDark: '#22d3ee' },
] as const;
