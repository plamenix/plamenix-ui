import { describe, expect, it } from 'vitest';
import {
  pluginContributionsToCommands,
  type CommandContributionPayload,
} from './command-contract.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

function entry(
  id: string,
  payload: CommandContributionPayload,
  pluginId = `plg.${id}`,
): PluginContribution<CommandContributionPayload> {
  return { pluginId, contribution: { id, payload } };
}

describe('pluginContributionsToCommands', () => {
  it('maps an empty list to an empty array', () => {
    expect(pluginContributionsToCommands([])).toEqual([]);
  });

  it('prefixes each command id with the pluginId so collisions across plugins are impossible', () => {
    const cmds = pluginContributionsToCommands([
      entry('refresh', { label: 'Refresh', run: () => {} }, 'com.acme.x'),
      entry('refresh', { label: 'Refresh', run: () => {} }, 'com.other.y'),
    ]);
    expect(cmds.map((c) => c.id)).toEqual(['com.acme.x:refresh', 'com.other.y:refresh']);
  });

  it('passes label + run through unchanged', () => {
    let fired = false;
    const cmds = pluginContributionsToCommands([
      entry('run-it', {
        label: 'Run it',
        run: () => {
          fired = true;
        },
      }),
    ]);
    expect(cmds[0]?.label).toBe('Run it');
    cmds[0]?.run();
    expect(fired).toBe(true);
  });

  it('threads optional description / shortcut / group / icon when present', () => {
    const Icon = () => null;
    const cmds = pluginContributionsToCommands([
      entry('full', {
        label: 'Full',
        description: 'every field',
        shortcut: '⌘⇧F',
        group: 'plug.X',
        icon: Icon,
        run: () => {},
      }),
    ]);
    expect(cmds[0]).toMatchObject({
      label: 'Full',
      description: 'every field',
      shortcut: '⌘⇧F',
      group: 'plug.X',
      icon: Icon,
    });
  });

  it('omits absent optional fields (exactOptionalPropertyTypes-safe — bare `undefined` is rejected)', () => {
    const cmds = pluginContributionsToCommands([
      entry('plain', { label: 'Plain', run: () => {} }),
    ]);
    expect('description' in cmds[0]!).toBe(false);
    expect('shortcut' in cmds[0]!).toBe(false);
    expect('icon' in cmds[0]!).toBe(false);
    expect('group' in cmds[0]!).toBe(false);
  });
});
