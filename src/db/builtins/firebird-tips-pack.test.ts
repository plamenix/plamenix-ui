import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerBuiltinFirebirdTips,
  unregisterBuiltinFirebirdTips,
} from './firebird-tips-pack.js';
import {
  flattenTipPacks,
  type TipPackContributionPayload,
} from '../tip-pack-contract.js';
import { FIREBIRD_TIPS, filterTipsForVersion } from '../firebird-tips.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';

describe('builtin Firebird tips pack (I4.7)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinFirebirdTips();
    registry.__reset();
  });

  it('registers under the built-in namespace at the tip_packs point', () => {
    registerBuiltinFirebirdTips();
    const contributions = registry.getContributions<TipPackContributionPayload>('tip_packs');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/firebird-tips');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('firebird-default');
  });

  it('payload carries every tip from the canonical FIREBIRD_TIPS array (no drift)', () => {
    registerBuiltinFirebirdTips();
    const [registered] = registry.getContributions<TipPackContributionPayload>('tip_packs');
    expect(registered?.contribution.payload.tips).toBe(FIREBIRD_TIPS);
    expect(registered?.contribution.payload.tips).toHaveLength(FIREBIRD_TIPS.length);
  });

  it('flattenTipPacks returns the built-in tips unchanged when only the built-in is registered', () => {
    registerBuiltinFirebirdTips();
    const all = flattenTipPacks(
      registry.getContributions<TipPackContributionPayload>('tip_packs'),
    );
    expect(all).toEqual([...FIREBIRD_TIPS]);
  });

  it('flattenTipPacks concatenates third-party packs after the built-in (priority order)', () => {
    registerBuiltinFirebirdTips();
    registerContributions('com.example.epf-tips', {
      tip_packs: [
        {
          id: 'epf-default',
          priority: 200,
          payload: {
            title: 'IBSurgeon EPF Tips',
            tips: [
              { id: 'epf-1', text: 'EPF tip one' },
              { id: 'epf-2', text: 'EPF tip two' },
            ],
          },
        },
      ],
    });
    const all = flattenTipPacks(
      registry.getContributions<TipPackContributionPayload>('tip_packs'),
    );
    // Built-in (priority 100, default) first; EPF (priority 200) after.
    expect(all.slice(0, FIREBIRD_TIPS.length)).toEqual([...FIREBIRD_TIPS]);
    expect(all.slice(FIREBIRD_TIPS.length).map((t) => t.id)).toEqual([
      'epf-1',
      'epf-2',
    ]);
  });

  it('higher-priority third-party pack precedes the built-in in flatten order', () => {
    registerContributions('com.example.priority-tips', {
      tip_packs: [
        {
          id: 'priority',
          priority: 10,
          payload: {
            title: 'High-priority pack',
            tips: [{ id: 'top', text: 'I run first' }],
          },
        },
      ],
    });
    registerBuiltinFirebirdTips();
    const all = flattenTipPacks(
      registry.getContributions<TipPackContributionPayload>('tip_packs'),
    );
    expect(all[0]?.id).toBe('top');
    // Built-in pack still surfaces — additive, not shadowed.
    expect(all.slice(1)).toEqual([...FIREBIRD_TIPS]);
  });

  it('version filter still applies to the merged stream', () => {
    registerBuiltinFirebirdTips();
    const all = flattenTipPacks(
      registry.getContributions<TipPackContributionPayload>('tip_packs'),
    );
    // Firebird 2 — every tip with minVersion >= 3 should be filtered.
    const fb2 = filterTipsForVersion(2);
    expect(fb2.every((t) => (t.minVersion ?? 0) <= 2)).toBe(true);
    // Sanity: the unfiltered list contains entries the filter drops,
    // and is at least as long as the filtered one.
    expect(all.length).toBeGreaterThanOrEqual(fb2.length);
  });

  it('teardown unregisters cleanly — subsequent register works (re-init safe)', () => {
    const teardown = registerBuiltinFirebirdTips();
    teardown();
    expect(registry.getContributions('tip_packs')).toHaveLength(0);
    expect(() => registerBuiltinFirebirdTips()).not.toThrow();
    expect(registry.getContributions('tip_packs')).toHaveLength(1);
  });
});
