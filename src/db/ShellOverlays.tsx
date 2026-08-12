import type { ReactElement } from 'react';
import { CommandPalette, type Command } from './CommandPalette.js';
import { SearchPalette } from './SearchPalette.js';
import { ShortcutsCheatSheet } from './ShortcutsCheatSheet.js';
import { StatusBar } from './StatusBar.js';
import type { Schema, StatementOutcome } from './types.js';

/**
 * The status bar and the three keyboard-summoned overlays, which every
 * shell renders at the foot of its tree in the same order with the same
 * props.
 *
 * Grouped not to save the lines — the four elements are mostly prop
 * forwarding — but because the set is a contract: a shell that renders
 * the command palette without the cheat sheet ships shortcuts nobody
 * can discover, and one that renders the search palette without wiring
 * `onPick` ships a search that finds things and cannot use them.
 * Bundling them makes the omission impossible rather than merely
 * unlikely.
 */

/** The tab fields these four read. */
export interface ShellOverlayTab {
  sessionId: string | null;
  health: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
  user: string;
  host: string;
  port: number;
  database: string;
  executedSql: string | null;
  results: StatementOutcome[] | null;
  schema: Schema | null;
}

export interface ShellOverlaysProps {
  tab: ShellOverlayTab;
  /** Bucket key for the status bar's recent-query readout. */
  recentKey: string;
  commands: Command[];
  paletteOpen: boolean;
  onPaletteClose: () => void;
  shortcutsOpen: boolean;
  onShortcutsClose: () => void;
  searchOpen: boolean;
  onSearchClose: () => void;
  /** Receives the identifier the user picked out of search. Hosts
   *  append it to the editor buffer; see {@link appendIdentifier}. */
  onSearchPick: (identifier: string) => void;
}

export function ShellOverlays({
  tab,
  recentKey,
  commands,
  paletteOpen,
  onPaletteClose,
  shortcutsOpen,
  onShortcutsClose,
  searchOpen,
  onSearchClose,
  onSearchPick,
}: ShellOverlaysProps): ReactElement {
  return (
    <>
      <StatusBar
        sessionId={tab.sessionId}
        health={tab.health}
        user={tab.user}
        host={tab.host}
        port={tab.port}
        database={tab.database}
        executedSql={tab.executedSql}
        results={tab.results}
        recentKey={recentKey}
      />
      <CommandPalette open={paletteOpen} onClose={onPaletteClose} commands={commands} />
      <ShortcutsCheatSheet open={shortcutsOpen} onClose={onShortcutsClose} />
      <SearchPalette
        open={searchOpen}
        schema={tab.schema}
        onClose={onSearchClose}
        onPick={onSearchPick}
      />
    </>
  );
}

/**
 * Appends an identifier the user picked out of search to the editor
 * buffer, inserting a separating space only when one is needed.
 *
 * The rule looks trivial and is the reason picking two tables in a row
 * does not produce `CUSTOMERSORDERS`. It was written out longhand in
 * both shells, which is two places for it to stop being true.
 *
 * An empty buffer gets no leading space, so the first pick starts the
 * statement cleanly rather than indented by one column.
 */
export function appendIdentifier(sql: string, identifier: string): string {
  const needsSpace = sql.length > 0 && !sql.endsWith(' ');
  return needsSpace ? `${sql} ${identifier}` : `${sql}${identifier}`;
}
