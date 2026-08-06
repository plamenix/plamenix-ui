/**
 * Slot component for I5.3 `toolbar_buttons` contributions. Mount once
 * per shell toolbar surface — the slot reads contributions live from
 * the registry, filters by `location`, and renders each as a button
 * matching the shell's existing per-location skin. Variants:
 *
 *   - `default` — bordered, hover:bg-elevated (`tab` / `tabstrip`)
 *   - `accent` — primary action skin (the Execute button's look)
 *   - `warning` — reconnect-style amber border + amber bg
 *   - `danger` — destructive red skin
 *
 * The `status` location compresses each button to icon-only by default
 * because the StatusBar footer is 28px tall and cannot fit text labels
 * comfortably. Pass `showLabel` to override.
 */

import { useMemo, type ComponentType, type ReactElement } from 'react';
import { usePluginContributions } from '../plugin-react/usePluginContributions.js';
import {
  pluginContributionsToToolbarButtons,
  type ToolbarButtonContributionPayload,
  type ToolbarButtonDescriptor,
  type ToolbarButtonVariant,
  type ToolbarLocation,
} from './toolbar-button-contract.js';

export interface ToolbarSlotProps<TCtx = unknown> {
  /** Toolbar surface this slot fills. */
  location: ToolbarLocation;
  /** Per-location context handed to each contribution's `when` +
   *  `run`. See `ToolbarContext` for the per-location shape. */
  ctx: TCtx;
  /** Force labels to render in the `status` slot. Default: hide for
   *  `status`, show elsewhere. Plugin-supplied icons are required when
   *  labels are hidden. */
  showLabel?: boolean;
  /** Optional className threaded into every button — useful for
   *  hosts that wrap the slot in a custom flex container with
   *  bespoke spacing. */
  buttonClassName?: string;
}

export function ToolbarSlot<TCtx = unknown>({
  location,
  ctx,
  showLabel,
  buttonClassName,
}: ToolbarSlotProps<TCtx>): ReactElement | null {
  const contributions =
    usePluginContributions<ToolbarButtonContributionPayload<TCtx>>('toolbar_buttons');
  const descriptors = useMemo(
    () => pluginContributionsToToolbarButtons(contributions, location, ctx),
    [contributions, location, ctx],
  );
  if (descriptors.length === 0) return null;
  const renderLabel = showLabel ?? location !== 'status';
  return (
    <>
      {descriptors.map((d) => (
        <ToolbarButton
          key={d.id}
          descriptor={d}
          showLabel={renderLabel}
          className={buttonClassName}
        />
      ))}
    </>
  );
}

interface ToolbarButtonProps<TCtx = unknown> {
  descriptor: ToolbarButtonDescriptor<TCtx>;
  showLabel: boolean;
  className?: string | undefined;
}

function ToolbarButton<TCtx>({
  descriptor,
  showLabel,
  className,
}: ToolbarButtonProps<TCtx>): ReactElement {
  const Icon: ComponentType<{ className?: string }> | undefined = descriptor.icon;
  const skin = SKIN_BY_VARIANT[descriptor.variant];
  return (
    <button
      type="button"
      onClick={descriptor.run}
      title={descriptor.hint}
      aria-label={descriptor.hint}
      data-plugin={descriptor.pluginId}
      data-contribution={descriptor.id}
      className={`${skin} ${className ?? ''}`.trim()}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {showLabel ? <span>{descriptor.label}</span> : null}
    </button>
  );
}

/** Tailwind class chains pulled from the existing shell button skins
 *  (QueryPanel + StatusBar reference) so plugin-contributed buttons
 *  visually match adjacent shell-owned buttons. */
const SKIN_BY_VARIANT: Record<ToolbarButtonVariant, string> = {
  default:
    'inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg',
  accent:
    'inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover',
  warning:
    'inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning hover:text-fg-inverted',
  danger:
    'inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-subtle px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-fg-inverted',
};
