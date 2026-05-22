/**
 * Templated DDL skeleton modal for the five non-table schema kinds:
 * View / Procedure / Trigger / Generator / Domain.
 *
 * Pattern matches `SchemaEditorModal` — the modal owns SQL state,
 * `onApply` hands the buffer to the host (typically appended to the
 * main editor) and the modal closes. Nothing executes from inside.
 *
 * For tables the dedicated visual builder (`SchemaEditorModal`) is
 * kept because column lists are structured; the other five kinds
 * have free-form bodies and benefit more from a syntax-highlighted
 * editor than a UI form.
 */

import { useEffect, useState } from 'react';
import { Cog, Eye, Hash, Shapes, X, Zap } from 'lucide-react';
import { SqlEditor } from './SqlEditor';
import type { Schema } from './types';

export type NewObjectKind = 'view' | 'procedure' | 'trigger' | 'generator' | 'domain';

interface KindMeta {
  title: string;
  icon: typeof Eye;
  template: string;
}

const VIEW_TEMPLATE = `CREATE VIEW NEW_VIEW (
    COL1,
    COL2
) AS
SELECT
    SRC.COL_A,
    SRC.COL_B
FROM SOURCE_TABLE SRC;
`;

const PROCEDURE_TEMPLATE = `CREATE PROCEDURE NEW_PROCEDURE (
    INPUT1 INTEGER
)
RETURNS (
    OUTPUT1 VARCHAR(100)
)
AS
BEGIN
    /* Selectable: emit rows with SUSPEND.
       Executable: assign OUTPUT1 and omit SUSPEND. */
    OUTPUT1 = 'hello';
    SUSPEND;
END
`;

const TRIGGER_TEMPLATE = `CREATE TRIGGER NEW_TRIGGER FOR TARGET_TABLE
ACTIVE BEFORE INSERT
POSITION 0
AS
BEGIN
    /* Access NEW.<column> / OLD.<column> here.
       For database-level triggers use ON CONNECT / ON DISCONNECT
       / ON TRANSACTION START | COMMIT | ROLLBACK in place of the
       table reference above. */
    NEW.UPDATED_AT = CURRENT_TIMESTAMP;
END
`;

const GENERATOR_TEMPLATE = `CREATE SEQUENCE NEW_SEQUENCE START WITH 1 INCREMENT BY 1;
`;

const DOMAIN_TEMPLATE = `CREATE DOMAIN D_NEW
    AS VARCHAR(100)
    NOT NULL
    CHECK (VALUE <> '');
`;

const KIND_META: Record<NewObjectKind, KindMeta> = {
  view: { title: 'Create view', icon: Eye, template: VIEW_TEMPLATE },
  procedure: { title: 'Create procedure', icon: Cog, template: PROCEDURE_TEMPLATE },
  trigger: { title: 'Create trigger', icon: Zap, template: TRIGGER_TEMPLATE },
  generator: { title: 'Create generator', icon: Hash, template: GENERATOR_TEMPLATE },
  domain: { title: 'Create domain', icon: Shapes, template: DOMAIN_TEMPLATE },
};

export interface NewObjectModalProps {
  open: boolean;
  kind: NewObjectKind;
  /** Optional schema for identifier completion inside the embedded
   *  SQL editor — same shape the main editor consumes. */
  schema?: Schema | null;
  onClose: () => void;
  /** Fired with the buffer text on Apply. The host typically appends
   *  this to the main editor; the modal then closes. */
  onApply: (sql: string) => void;
}

export function NewObjectModal({
  open,
  kind,
  schema = null,
  onClose,
  onApply,
}: NewObjectModalProps) {
  const meta = KIND_META[kind];
  const [sql, setSql] = useState(meta.template);

  // Reset to the template each time the modal opens or the kind
  // changes mid-open (e.g. user clicked a different + button after
  // closing the first modal — not currently possible but kept robust).
  useEffect(() => {
    if (open) setSql(KIND_META[kind].template);
  }, [open, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const Icon = meta.icon;

  const handleApply = () => {
    onApply(sql);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label={meta.title}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[6vh] flex max-h-[88vh] w-[min(60rem,95vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <Icon className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">{meta.title}</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex min-h-[400px] flex-1 flex-col overflow-hidden">
          <SqlEditor
            value={sql}
            onChange={setSql}
            schema={schema}
            onSubmit={handleApply}
          />
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-edge bg-canvas px-3 py-2">
          <span className="text-[11px] text-fg-subtle">
            Edits the template, then drops it into the SQL editor. Nothing
            executes from here — run it from the main editor when ready.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1 text-xs text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover"
            >
              Apply to editor
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
