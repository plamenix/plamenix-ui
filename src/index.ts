/**
 * @plamenix/ui — shared React library consumed by the Plamenix desktop and
 * web editions.
 *
 * The library is transport-agnostic: every host interaction goes through a
 * {@link Transport} implementation supplied by the consuming edition.
 * Components, hooks, and stores accrete here as concrete consumers need
 * them; new exports are added when a second consumer needs the same shape,
 * not preemptively.
 */

export type { Transport } from './transport';
export { TransportError } from './transport';

export type {
  ColumnDescription,
  ColumnInfo,
  ColumnValue,
  ConnectionForm,
  CryptState,
  Profile,
  QueryResult,
  Row,
  Schema,
  TableAction,
  TableInfo,
  TableKind,
} from './db/types';
export { renderCell } from './db/types';
export { Field, type FieldProps } from './db/Field';
export { ConnectionPanel, type ConnectionPanelProps } from './db/ConnectionPanel';
export { ConnectionScreen, type ConnectionScreenProps } from './db/ConnectionScreen';
export { CryptBadge, type CryptBadgeProps } from './db/CryptBadge';
export { ProfilePicker, type ProfilePickerProps } from './db/ProfilePicker';
export { QueryPanel, type QueryPanelProps } from './db/QueryPanel';
export { SchemaBrowser, type SchemaBrowserProps } from './db/SchemaBrowser';
export { SqlEditor, type SqlEditorProps } from './db/SqlEditor';
export { TableContextMenu, type TableContextMenuProps } from './db/TableContextMenu';
export { TabStrip, type TabStripProps } from './db/TabStrip';
export {
  DEFAULT_FORM,
  useTabsStore,
  type TabState,
  type TabsStore,
  type TabsStoreActions,
} from './db/tabs-store';

export {
  ACCENT_COLORS,
  type AccentDef,
  type AccentId,
} from './theme/accent-colors';
export {
  applyThemeToDocument,
  useThemeStore,
  type ThemeMode,
  type ThemeState,
} from './theme/theme-store';
export {
  SettingsButton,
  SettingsPanel,
  type SettingsPanelProps,
} from './theme/SettingsPanel';
export { ResultTable, type ResultTableProps } from './db/ResultTable';
