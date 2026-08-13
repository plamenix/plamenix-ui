import { useEffect } from 'react';
import { registerBuiltinPasswordAuthProvider } from './auth/builtins/password-provider.js';
import { registerBuiltinFirebirdKeywordsCompletion } from './completions/builtins/firebird-keywords.js';
import { registerBuiltinDefaultDashboardSections } from './dashboard/builtins/default-sections.js';
import { registerBuiltinBasicSyntaxDiagnostic } from './diagnostics/builtins/basic-syntax.js';
import { registerBuiltinBlobRenderer } from './db/builtins/blob-cell-renderer.js';
import { registerBuiltinCsvExport } from './db/builtins/csv-export.js';
import { registerBuiltinDbaToolbox } from './db/builtins/dba-toolbox.js';
import { registerBuiltinFirebirdTips } from './db/builtins/firebird-tips-pack.js';
import { registerBuiltinJsonExport } from './db/builtins/json-export.js';
import { registerBuiltinSqlExport } from './db/builtins/sql-export.js';
import { registerBuiltinXlsxExport } from './db/builtins/xlsx-export.js';
import { registerBuiltinXmlExport } from './db/builtins/xml-export.js';
import { registerBuiltinBasicSqlFormatter } from './formatters/builtins/basic-formatter.js';
import { registerBuiltinCsvImporter } from './imports/builtins/csv-importer.js';
import { registerBuiltinTableInspectorTabs } from './inspectors/builtins/table-inspector-tabs.js';
import { registerBuiltinDefaultSettingsSections } from './settings-panels/builtins/default-sections.js';
import { registerBuiltinDefaultStatusBarItems } from './status-bar/builtins/default-items.js';
import { registerBuiltinDefaultThemes } from './theme/builtins/default-themes.js';

/**
 * Every shipped built-in contribution, registered for the life of the
 * shell rather than for the life of whichever component happened to
 * need it first.
 *
 * They used to register from inside the components that consume them —
 * the SQL formatter from the DDL viewer, the five export formats from
 * the result grid, the password auth provider from the connect screen.
 * That made a feature's availability depend on an unrelated component
 * being mounted, and `unregisterBuiltin` is not refcounted, so it made
 * *unmounting* one consumer withdraw the contribution from every other.
 *
 * The visible symptom was the Format button. The web shell renders
 * `DdlViewerModal` unconditionally, so its formatter stayed registered
 * and the button worked. The desktop shell does not render that modal
 * at all — it registers the same formatter from `RoutineObjectView`,
 * which mounts only while a stored procedure is open. So on desktop the
 * Format button in the SQL editor appeared only while the user happened
 * to be looking at a routine, which is the one place the text is
 * read-only.
 *
 * Others were latent rather than visible: the export formats went with
 * the result grid, and the password auth provider went as soon as the
 * user connected and the connect screen unmounted.
 */

/**
 * The registrations, in no significant order — each is independent.
 *
 * `registerBuiltinSchemaContextMenu` is deliberately absent: it takes
 * the host's handlers, so it cannot be registered without knowing who
 * is going to act on the menu items. It stays with whoever supplies
 * them.
 */
const BUILTINS: (() => () => void)[] = [
  registerBuiltinBasicSqlFormatter,
  registerBuiltinBlobRenderer,
  registerBuiltinBasicSyntaxDiagnostic,
  registerBuiltinCsvExport,
  registerBuiltinCsvImporter,
  registerBuiltinDbaToolbox,
  registerBuiltinDefaultDashboardSections,
  registerBuiltinDefaultSettingsSections,
  registerBuiltinDefaultStatusBarItems,
  registerBuiltinDefaultThemes,
  registerBuiltinFirebirdKeywordsCompletion,
  registerBuiltinFirebirdTips,
  registerBuiltinJsonExport,
  registerBuiltinPasswordAuthProvider,
  registerBuiltinSqlExport,
  registerBuiltinTableInspectorTabs,
  registerBuiltinXlsxExport,
  registerBuiltinXmlExport,
];

/**
 * Registers every built-in and returns a teardown that removes them.
 *
 * @returns A disposer that unregisters everything, for `useEffect`
 * pairing. Callers that never tear down can ignore it.
 */
export function registerAllBuiltins(): () => void {
  const teardowns = BUILTINS.map((register) => register());
  return () => {
    for (const teardown of teardowns) teardown();
  };
}

/**
 * Registers every built-in for the life of the component that calls it.
 *
 * Call once, from the shell's root. Calling it from anywhere that
 * unmounts reintroduces the problem this exists to solve.
 */
export function useBuiltinContributions(): void {
  useEffect(() => registerAllBuiltins(), []);
}
