import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerBuiltinSchemaContextMenu,
  unregisterBuiltinSchemaContextMenu,
  SCHEMA_MENU_IDS,
  type SchemaContextMenuHandlers,
} from './schema-context-menu.js';
import {
  pluginContributionsToMenuItems,
  type MenuContext,
  type MenuContributionPayload,
} from '../menu-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';
import type { SchemaAction, TableInfo } from '../../db/types.js';

function stubHandlers(emitted: SchemaAction[] = []): SchemaContextMenuHandlers {
  return {
    emit: vi.fn((action: SchemaAction) => {
      emitted.push(action);
    }),
  };
}

function table(name: string): TableInfo {
  return {
    name,
    kind: 'table',
    columns: [{ name: 'ID', position: 0, sqlType: 'INTEGER', nullable: false }],
    primaryKey: ['ID'],
  };
}

function items(menuId: string, target: unknown) {
  return pluginContributionsToMenuItems(
    registry.getContributions<MenuContributionPayload>('menus'),
    menuId,
    { menuId, target } as MenuContext,
  );
}

describe('builtin schema context menu (I5.2)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinSchemaContextMenu();
    registry.__reset();
  });

  it('registers 18 contributions under the built-in namespace at priorities in the 200-range', () => {
    // 3 table + 3 view + 4 procedure + 3 trigger + 3 generator + 2 domain = 18.
    // (recompute-statistics + recreate-table for table now live in the
    // I4.8 DBA toolbox schema_actions built-in; menus built-in stops
    // duplicating them post-I5.5.)
    registerBuiltinSchemaContextMenu(stubHandlers());
    const contributions = registry.getContributions('menus');
    expect(contributions).toHaveLength(18);
    expect(contributions.every((c) => c.pluginId === '@plamenix-builtin/schema-context-menu')).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    // All built-in priorities live in the 200-249 band so the default
    // third-party priority (100) sorts above them naturally.
    expect(
      contributions.every(
        (c) => (c.contribution.priority ?? 100) >= 200 && (c.contribution.priority ?? 100) < 250,
      ),
    ).toBe(true);
  });

  it('3 contributions surface in schema.table — alter / create-index + drop danger cluster (recompute-statistics + recreate moved to DBA toolbox schema_actions in I5.5)', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    const labels = items(SCHEMA_MENU_IDS.table, table('CUSTOMERS')).map((d) => d.label);
    expect(labels).toEqual([
      'ALTER TABLE…',
      'CREATE INDEX…',
      // danger cluster at bottom — only DROP now (RECREATE moved out)
      'DROP',
    ]);
  });

  it('schema.view surfaces 3 items (alter / show-source / drop)', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    const labels = items(SCHEMA_MENU_IDS.view, table('V_ACTIVE')).map((d) => d.label);
    expect(labels).toEqual(['ALTER VIEW…', 'Show source', 'DROP']);
  });

  it('schema.procedure surfaces 4 items (execute / alter / show-source / drop)', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    const labels = items(SCHEMA_MENU_IDS.procedure, { name: 'P', inputs: [], outputs: [] })
      .map((d) => d.label);
    expect(labels).toEqual(['EXECUTE…', 'ALTER PROCEDURE…', 'Show source', 'DROP']);
  });

  it('schema.trigger surfaces 3 items, danger cluster at bottom', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    const items_ = items(SCHEMA_MENU_IDS.trigger, { name: 'TR_AUDIT', active: true });
    const labels = items_.map((d) => d.label);
    expect(labels).toEqual(['ALTER ACTIVE / INACTIVE', 'Show source', 'DROP']);
    expect(items_[items_.length - 1]?.tone).toBe('danger');
  });

  it('schema.generator surfaces 3 items (next-value / reset / drop)', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    const labels = items(SCHEMA_MENU_IDS.generator, { name: 'GEN_ID' }).map((d) => d.label);
    expect(labels).toEqual(['NEXT VALUE FOR', 'Reset to 0', 'DROP']);
  });

  it('schema.domain surfaces 2 items (alter-type / drop)', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    const labels = items(SCHEMA_MENU_IDS.domain, { name: 'D_EMAIL' }).map((d) => d.label);
    expect(labels).toEqual(['ALTER DOMAIN … TYPE', 'DROP']);
  });

  it('clicking the DROP item emits the expected SchemaAction', () => {
    const emitted: SchemaAction[] = [];
    const h = stubHandlers(emitted);
    registerBuiltinSchemaContextMenu(h);
    const t = table('ORDERS');
    const dropItem = items(SCHEMA_MENU_IDS.table, t).find((d) => d.label === 'DROP')!;
    dropItem.run();
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(emitted[0]).toEqual({ kind: 'table', action: 'drop', target: t });
  });

  it('clicking the EXECUTE item on a procedure emits action:execute', () => {
    const emitted: SchemaAction[] = [];
    const h = stubHandlers(emitted);
    registerBuiltinSchemaContextMenu(h);
    const proc = { name: 'SP_TEST', inputs: [], outputs: [] } as unknown;
    const exec = items(SCHEMA_MENU_IDS.procedure, proc).find((d) => d.label === 'EXECUTE…')!;
    exec.run();
    expect(emitted[0]).toMatchObject({ kind: 'procedure', action: 'execute' });
  });

  it('third-party item at lower priority appears AHEAD of built-ins within the same default group', () => {
    registerBuiltinSchemaContextMenu(stubHandlers());
    registerContributions('com.example.audit', {
      menus: [
        {
          id: 'audit-trail',
          priority: 50,
          payload: {
            label: 'View audit trail',
            menuId: SCHEMA_MENU_IDS.table,
            run: () => {},
          },
        },
      ],
    });
    const labels = items(SCHEMA_MENU_IDS.table, table('CUSTOMERS')).map((d) => d.label);
    expect(labels[0]).toBe('View audit trail');
  });

  it('third-party danger item joins the bottom danger cluster regardless of registration order', () => {
    registerContributions('com.example.purge', {
      menus: [
        {
          id: 'purge-rows',
          priority: 10,
          payload: {
            label: 'Purge all rows (DANGER)',
            menuId: SCHEMA_MENU_IDS.table,
            tone: 'danger',
            run: () => {},
          },
        },
      ],
    });
    registerBuiltinSchemaContextMenu(stubHandlers());
    const labels = items(SCHEMA_MENU_IDS.table, table('CUSTOMERS')).map((d) => d.label);
    // First non-danger items come from the built-in (priority 200-range);
    // danger cluster at end has the third-party purge (priority 10)
    // ahead of the built-in DROP (priority 240). RECREATE is gone
    // from the `menus` registry post-I5.5 — lives in DBA toolbox.
    const last2 = labels.slice(-2);
    expect(last2).toEqual(['Purge all rows (DANGER)', 'DROP']);
  });

  it('teardown unregisters cleanly + re-register works (re-init safe)', () => {
    const teardown = registerBuiltinSchemaContextMenu(stubHandlers());
    teardown();
    expect(registry.getContributions('menus')).toHaveLength(0);
    expect(() => registerBuiltinSchemaContextMenu(stubHandlers())).not.toThrow();
    expect(registry.getContributions('menus')).toHaveLength(18);
  });
});
