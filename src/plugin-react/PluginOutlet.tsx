/**
 * Slot component for one extension point.
 *
 * The host places `<PluginOutlet point="..." />` wherever third-party
 * (or built-in) contributions should render. The component subscribes
 * to the registry slice for `point` and re-renders when contributions
 * are added or removed.
 *
 * In I2.1 the default render path lays each contribution out as a
 * keyed `<div>` carrying the plugin id + contribution id. Real shell
 * consumers (Section I3 wires `cell_renderers`, `export_formats`,
 * `commands` first) will pass a `render` prop to interpose their own
 * UI shape per contribution.
 */

import { Fragment, type ReactNode } from 'react';
import { usePluginContributions } from './usePluginContributions.js';
import type { Contribution, ContributionRenderer, ExtensionPoint } from './types.js';

export interface PluginOutletProps<Payload = unknown> {
  /** Extension point this slot drains. */
  point: ExtensionPoint;
  /**
   * Custom render-prop. When omitted, each contribution renders as a
   * `<div data-plugin>...</div>` carrying its identifiers — useful
   * during development; consumers should pass `render` in production.
   */
  render?: ContributionRenderer<Payload>;
  /** Optional fallback when no contributions are registered. */
  fallback?: ReactNode;
}

export function PluginOutlet<Payload = unknown>({
  point,
  render,
  fallback,
}: PluginOutletProps<Payload>): ReactNode {
  const contributions = usePluginContributions<Payload>(point);

  if (contributions.length === 0) {
    return fallback ?? null;
  }

  if (render) {
    return (
      <>
        {contributions.map(({ pluginId, contribution }) => (
          <Fragment key={`${pluginId}:${contribution.id}`}>
            {render({ pluginId, contribution })}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      {contributions.map(({ pluginId, contribution }) => (
        <div
          key={`${pluginId}:${contribution.id}`}
          data-plugin={pluginId}
          data-contribution={contribution.id}
        >
          {String((contribution as Contribution).id)}
        </div>
      ))}
    </>
  );
}
