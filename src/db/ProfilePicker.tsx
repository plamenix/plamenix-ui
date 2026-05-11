import type { Profile } from './types';

export interface ProfilePickerProps {
  /** All currently saved profiles. The dropdown renders one option per
   *  entry, plus a sentinel "New connection" option for `null`. */
  profiles: Profile[];
  /** Id of the currently selected profile, or `null` for the
   *  manual-connect path. */
  selectedId: string | null;
  /** Working copy of the name for the next save. The host owns this
   *  state; the picker is fully controlled. */
  name: string;
  /** Disables every control while a request is in flight. */
  busy: boolean;
  onSelect: (id: string | null) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  /** Fired when the user clicks Rename. Only enabled when a profile
   *  is selected AND its stored name differs from the working `name`.
   *  Distinct from `onSave` so the host can rename without
   *  overwriting other profile fields with the current form. */
  onRename?: () => void;
}

/**
 * Saved-profile picker rendered above the connection panel.
 *
 * Selecting an entry hands the host a profile id; the host hydrates
 * the connection form from the profile's fields. Saving uses the
 * currently selected id (update) or assigns a fresh id (insert). The
 * picker itself is dumb: every interaction is a callback.
 */
export function ProfilePicker({
  profiles,
  selectedId,
  name,
  busy,
  onSelect,
  onNameChange,
  onSave,
  onDelete,
  onRename,
}: ProfilePickerProps) {
  const hasSelection = selectedId !== null;
  const canSave = !busy && name.trim() !== '';
  const selectedProfile = selectedId
    ? profiles.find((p) => p.id === selectedId)
    : undefined;
  const canRename =
    !busy &&
    hasSelection &&
    onRename !== undefined &&
    name.trim() !== '' &&
    selectedProfile !== undefined &&
    selectedProfile.name !== name.trim();
  return (
    <section className="flex flex-col gap-2 rounded border border-zinc-800 p-4">
      <h2 className="text-sm font-medium text-zinc-300">Saved profiles</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input min-w-[12rem] flex-1"
          value={selectedId ?? ''}
          disabled={busy}
          onChange={(e) => onSelect(e.target.value === '' ? null : e.target.value)}
          aria-label="Select saved profile"
        >
          <option value="">New connection…</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="input min-w-[10rem] flex-1"
          placeholder="Profile name"
          value={name}
          disabled={busy}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="Profile name"
        />
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1 text-sm text-zinc-50 disabled:opacity-50"
          disabled={!canSave}
          onClick={onSave}
        >
          {hasSelection ? 'Save' : 'Save as new'}
        </button>
        {onRename && (
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1 text-sm text-zinc-300 disabled:opacity-50"
            disabled={!canRename}
            onClick={onRename}
            title="Rename the selected profile without overwriting its other fields"
          >
            Rename
          </button>
        )}
        <button
          type="button"
          className="rounded border border-red-700 px-3 py-1 text-sm text-red-300 disabled:opacity-50"
          disabled={busy || !hasSelection}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
