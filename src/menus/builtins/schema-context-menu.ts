/**
 * Built-in schema context-menu (I5.2) — extracts the six per-kind
 * static menu arrays (`TABLE_MENU` / `VIEW_MENU` / `PROC_MENU` /
 * `TRIGGER_MENU` / `GEN_MENU` / `DOMAIN_MENU`) that used to live in
 * `SchemaBrowser.tsx` into one cohesive built-in registering under
 * `@plamenix-builtin/schema-context-menu`.
 *
 * 18 contributions across 6 `menuId`s preserve label/hint/icon/tone
 * parity. Each contribution's `run` callback closes the
 * shell-supplied `emit(action: SchemaAction)` so the existing
 * downstream pipeline (`schemaDdl` → editor.insertText or
 * db.execute confirm for DROP) keeps firing identically.
 *
 * Why the host passes a single `emit` callback rather than 18
 * individual handlers: every built-in entry maps onto a variant of
 * the existing `SchemaAction` discriminated union; emitting via the
 * same dispatcher keeps the host wiring (toast on DROP, DDL template
 * insertion, editor focus, etc.) in one place. Third-party plugins
 * don't see `emit`; they ship their own `run` that calls into the
 * plugin API (`api.editor.insertText`, `api.db.execute`, etc.)
 * directly.
 *
 * **Safety-net pattern**: the existing static-menu arrays in
 * `SchemaBrowser.tsx` are removed when the consumer wiring lands —
 * unlike I4.1's BLOB renderer pattern, there's no fallback path here
 * because `TableContextMenu` renders whatever `items` array the
 * caller hands it. If the built-in fails to register (only possible
 * if the registry itself is broken), the menu surfaces empty — but
 * the menu still opens, doesn't crash. A future test env that
 * doesn't call `registerBuiltinSchemaContextMenu` simply sees empty
 * context menus, which is the right degraded behaviour.
 */

import {
  Cog,
  Eye,
  Hash,
  KeyRound,
  Pencil,
  Play,
  Power,
  RotateCcw,
  Shapes,
  Table2,
  Trash2,
  Zap,
} from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type {
  DomainInfo,
  GeneratorInfo,
  ProcedureInfo,
  SchemaAction,
  TableInfo,
  TriggerInfo,
} from '../../db/types.js';
import type {
  MenuContext,
  MenuContributionPayload,
} from '../menu-contract.js';

const BUILTIN_NAME = 'schema-context-menu';

/** Menu ids the built-in registers against. Exposed so the
 *  `SchemaBrowser` consumer (and tests) reference the same string
 *  constants rather than re-typing them. */
export const SCHEMA_MENU_IDS = {
  table: 'schema.table',
  view: 'schema.view',
  procedure: 'schema.procedure',
  trigger: 'schema.trigger',
  generator: 'schema.generator',
  domain: 'schema.domain',
} as const;

export type SchemaMenuId = (typeof SCHEMA_MENU_IDS)[keyof typeof SCHEMA_MENU_IDS];

/** Icons exposed so the `SchemaBrowser` consumer + Permissions panel
 *  can reuse them without re-deriving — keeps menu icon parity with
 *  the kind-glyph the menu header shows. */
export const SCHEMA_MENU_HEADER_ICONS = {
  table: Table2,
  view: Eye,
  procedure: Cog,
  trigger: Zap,
  generator: Hash,
  domain: Shapes,
} as const;

/** Closure the shell hands the built-in at register time. Each
 *  contribution's `run` calls `emit(action)` — the host then routes
 *  the action through its existing `schemaDdl` pipeline (insert into
 *  the editor for ALTER / EXECUTE / etc., or run after confirm for
 *  DROP). */
export interface SchemaContextMenuHandlers {
  emit(action: SchemaAction): void;
}

/** Internal helper — narrows the `MenuContext.target` type per menuId. */
function tableCtx(ctx: MenuContext): TableInfo {
  return ctx.target as TableInfo;
}
function procCtx(ctx: MenuContext): ProcedureInfo {
  return ctx.target as ProcedureInfo;
}
function trigCtx(ctx: MenuContext): TriggerInfo {
  return ctx.target as TriggerInfo;
}
function genCtx(ctx: MenuContext): GeneratorInfo {
  return ctx.target as GeneratorInfo;
}
function domainCtx(ctx: MenuContext): DomainInfo {
  return ctx.target as DomainInfo;
}

/**
 * Registers the eighteen built-in schema context menu items.
 *
 * Returns a teardown closure for `useEffect` pairing.
 */
export function registerBuiltinSchemaContextMenu(
  h: SchemaContextMenuHandlers,
): () => void {
  // Per-item priorities chosen to preserve the legacy UX order of
  // each per-kind menu. Built-ins live in the 200-range; the
  // registry default priority is 100, so a third-party plugin
  // registering at the default appears above the built-ins in the
  // menu (the natural "community plugins extend, not replace, the
  // shell defaults" expectation).
  const bindings: { id: string; priority: number; payload: MenuContributionPayload }[] = [
    // ─── TABLE ────────────────────────────────────────────────────
    {
      id: 'table.alter',
      priority: 200,
      payload: {
        label: 'ALTER TABLE…',
        hint: 'Edit columns or constraints',
        icon: Pencil,
        menuId: SCHEMA_MENU_IDS.table,
        run: (ctx) =>
          h.emit({ kind: 'table', action: 'alter', target: tableCtx(ctx) }),
      },
    },
    {
      id: 'table.create-index',
      priority: 210,
      payload: {
        label: 'CREATE INDEX…',
        hint: 'Add a new index',
        icon: KeyRound,
        menuId: SCHEMA_MENU_IDS.table,
        run: (ctx) =>
          h.emit({ kind: 'table', action: 'create-index', target: tableCtx(ctx) }),
      },
    },
    // I5.5 — `table.recompute-statistics` and `table.recreate` formerly
    // lived here as `menus` contributions, but the I4.8 DBA toolbox
    // built-in already registers them through the `schema_actions`
    // contract (with the same labels + hints + destructive flag). The
    // SchemaBrowser action menu now reads from both registries and
    // appends `schema_actions` items after `menus` items, so keeping
    // them in `menus` would surface duplicates. They live in the DBA
    // toolbox built-in (`@plamenix-builtin/dba-toolbox`) — single
    // source of truth for those two DDL emitters.
    {
      id: 'table.drop',
      priority: 240,
      payload: {
        label: 'DROP',
        hint: 'Permanently delete this table',
        icon: Trash2,
        menuId: SCHEMA_MENU_IDS.table,
        tone: 'danger',
        run: (ctx) =>
          h.emit({ kind: 'table', action: 'drop', target: tableCtx(ctx) }),
      },
    },

    // ─── VIEW ─────────────────────────────────────────────────────
    {
      id: 'view.alter',
      priority: 200,
      payload: {
        label: 'ALTER VIEW…',
        hint: 'Edit the view definition',
        icon: Pencil,
        menuId: SCHEMA_MENU_IDS.view,
        run: (ctx) =>
          h.emit({ kind: 'view', action: 'alter', target: tableCtx(ctx) }),
      },
    },
    {
      id: 'view.show-source',
      priority: 210,
      payload: {
        label: 'Show source',
        hint: 'Insert SELECT against RDB$VIEW_SOURCE',
        icon: KeyRound,
        menuId: SCHEMA_MENU_IDS.view,
        run: (ctx) =>
          h.emit({ kind: 'view', action: 'show-source', target: tableCtx(ctx) }),
      },
    },
    {
      id: 'view.drop',
      priority: 220,
      payload: {
        label: 'DROP',
        hint: 'Permanently delete this view',
        icon: Trash2,
        menuId: SCHEMA_MENU_IDS.view,
        tone: 'danger',
        run: (ctx) =>
          h.emit({ kind: 'view', action: 'drop', target: tableCtx(ctx) }),
      },
    },

    // ─── PROCEDURE ────────────────────────────────────────────────
    {
      id: 'procedure.execute',
      priority: 200,
      payload: {
        label: 'EXECUTE…',
        hint: 'Insert an EXECUTE PROCEDURE template',
        icon: Play,
        menuId: SCHEMA_MENU_IDS.procedure,
        run: (ctx) =>
          h.emit({ kind: 'procedure', action: 'execute', target: procCtx(ctx) }),
      },
    },
    {
      id: 'procedure.alter',
      priority: 210,
      payload: {
        label: 'ALTER PROCEDURE…',
        hint: 'Edit the procedure body',
        icon: Pencil,
        menuId: SCHEMA_MENU_IDS.procedure,
        run: (ctx) =>
          h.emit({ kind: 'procedure', action: 'alter', target: procCtx(ctx) }),
      },
    },
    {
      id: 'procedure.show-source',
      priority: 220,
      payload: {
        label: 'Show source',
        hint: 'Insert SELECT against RDB$PROCEDURE_SOURCE',
        icon: KeyRound,
        menuId: SCHEMA_MENU_IDS.procedure,
        run: (ctx) =>
          h.emit({
            kind: 'procedure',
            action: 'show-source',
            target: procCtx(ctx),
          }),
      },
    },
    {
      id: 'procedure.drop',
      priority: 230,
      payload: {
        label: 'DROP',
        hint: 'Permanently delete this procedure',
        icon: Trash2,
        menuId: SCHEMA_MENU_IDS.procedure,
        tone: 'danger',
        run: (ctx) =>
          h.emit({ kind: 'procedure', action: 'drop', target: procCtx(ctx) }),
      },
    },

    // ─── TRIGGER ──────────────────────────────────────────────────
    {
      id: 'trigger.toggle-active',
      priority: 200,
      payload: {
        label: 'ALTER ACTIVE / INACTIVE',
        hint: 'Toggle the trigger state',
        icon: Power,
        menuId: SCHEMA_MENU_IDS.trigger,
        run: (ctx) =>
          h.emit({
            kind: 'trigger',
            action: 'toggle-active',
            target: trigCtx(ctx),
          }),
      },
    },
    {
      id: 'trigger.show-source',
      priority: 210,
      payload: {
        label: 'Show source',
        hint: 'Insert SELECT against RDB$TRIGGER_SOURCE',
        icon: KeyRound,
        menuId: SCHEMA_MENU_IDS.trigger,
        run: (ctx) =>
          h.emit({
            kind: 'trigger',
            action: 'show-source',
            target: trigCtx(ctx),
          }),
      },
    },
    {
      id: 'trigger.drop',
      priority: 220,
      payload: {
        label: 'DROP',
        hint: 'Permanently delete this trigger',
        icon: Trash2,
        menuId: SCHEMA_MENU_IDS.trigger,
        tone: 'danger',
        run: (ctx) =>
          h.emit({ kind: 'trigger', action: 'drop', target: trigCtx(ctx) }),
      },
    },

    // ─── GENERATOR ────────────────────────────────────────────────
    {
      id: 'generator.next-value',
      priority: 200,
      payload: {
        label: 'NEXT VALUE FOR',
        hint: 'Insert SELECT NEXT VALUE FOR',
        icon: Play,
        menuId: SCHEMA_MENU_IDS.generator,
        run: (ctx) =>
          h.emit({
            kind: 'generator',
            action: 'next-value',
            target: genCtx(ctx),
          }),
      },
    },
    {
      id: 'generator.reset',
      priority: 210,
      payload: {
        label: 'Reset to 0',
        hint: 'Insert SET GENERATOR ... TO 0',
        icon: RotateCcw,
        menuId: SCHEMA_MENU_IDS.generator,
        run: (ctx) =>
          h.emit({ kind: 'generator', action: 'reset', target: genCtx(ctx) }),
      },
    },
    {
      id: 'generator.drop',
      priority: 220,
      payload: {
        label: 'DROP',
        hint: 'Permanently delete this generator',
        icon: Trash2,
        menuId: SCHEMA_MENU_IDS.generator,
        tone: 'danger',
        run: (ctx) =>
          h.emit({ kind: 'generator', action: 'drop', target: genCtx(ctx) }),
      },
    },

    // ─── DOMAIN ───────────────────────────────────────────────────
    {
      id: 'domain.alter-type',
      priority: 200,
      payload: {
        label: 'ALTER DOMAIN … TYPE',
        hint: 'Change the underlying SQL type',
        icon: Pencil,
        menuId: SCHEMA_MENU_IDS.domain,
        run: (ctx) =>
          h.emit({
            kind: 'domain',
            action: 'alter-type',
            target: domainCtx(ctx),
          }),
      },
    },
    {
      id: 'domain.drop',
      priority: 210,
      payload: {
        label: 'DROP',
        hint: 'Permanently delete this domain',
        icon: Trash2,
        menuId: SCHEMA_MENU_IDS.domain,
        tone: 'danger',
        run: (ctx) =>
          h.emit({ kind: 'domain', action: 'drop', target: domainCtx(ctx) }),
      },
    },
  ];

  registerBuiltin(BUILTIN_NAME, {
    menus: bindings.map((b) => ({
      id: b.id,
      priority: b.priority,
      payload: b.payload,
    })),
  });

  return () => unregisterBuiltin(BUILTIN_NAME);
}

/** Explicit teardown — alternative to the returned closure. */
export function unregisterBuiltinSchemaContextMenu(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
