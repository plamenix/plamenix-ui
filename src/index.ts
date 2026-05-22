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
export {
  createConsoleSink,
  createRecordingSink,
  getLogger,
  log,
  setLogLevel,
  setLogSink,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type Logger,
  type RecordingSink,
} from './log';

export type {
  AttachmentInfo,
  ColumnDescription,
  ColumnInfo,
  ColumnValue,
  ConnectionForm,
  CryptState,
  DatabaseAlias,
  DatabaseStats,
  DomainInfo,
  GeneratorInfo,
  HistoryEntry,
  ListAliasesResult,
  MonDatabase,
  ProcedureInfo,
  Profile,
  QueryResult,
  Row,
  Schema,
  StatementInfo,
  StatementOutcome,
  SchemaAction,
  TableAction,
  TableInfo,
  TableKind,
  TestConnectionResult,
  TriggerInfo,
} from './db/types';
export { renderCell, SUPPORTED_CHARSETS } from './db/types';
export { Field, type FieldProps } from './db/Field';
export { ConnectionPanel, type ConnectionPanelProps } from './db/ConnectionPanel';
export { ConnectionScreen, type ConnectionScreenProps } from './db/ConnectionScreen';
export {
  CommandPalette,
  type Command,
  type CommandPaletteProps,
} from './db/CommandPalette';
export { HistoryPanel, type HistoryPanelProps } from './db/HistoryPanel';
export { ErrorBanner, type ErrorBannerProps } from './db/ErrorBanner';
export { PluginsSidebar, type PluginsSidebarProps } from './plugins/PluginsSidebar';
export {
  PluginPanelModal,
  type PluginPanelModalProps,
} from './plugins/PluginPanelModal';
export type {
  ActivePlugin,
  ActivationInfo,
  PluginLogEntry,
  SidebarPanelInfo,
} from './plugins/types';
export {
  parseFirebirdError,
  errorKindLabel,
  type FirebirdErrorInfo,
} from './db/error-info';
export { CryptBadge, type CryptBadgeProps } from './db/CryptBadge';
export { ProfilePicker, type ProfilePickerProps } from './db/ProfilePicker';
export {
  QueryPanel,
  type QueryPanelProps,
  type SessionHealth,
} from './db/QueryPanel';
export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type OrderBy,
  type Pagination,
  type SortDirection,
} from './db/pagination';
export { SchemaBrowser, type SchemaBrowserProps } from './db/SchemaBrowser';
export {
  ObjectListPage,
  type ObjectListKind,
  type ObjectListPageProps,
} from './db/ObjectListPage';
export {
  NewObjectModal,
  type NewObjectKind,
  type NewObjectModalProps,
} from './db/NewObjectModal';
export {
  SchemaEditorModal,
  type SchemaEditorModalProps,
} from './db/SchemaEditorModal';
export {
  buildCreateTableSql,
  freshColumnDraft,
  STOCK_TYPES,
  validateDraft,
  type ColumnDraft,
  type ValidationResult,
} from './db/schema-editor';
export {
  SearchPalette,
  type SearchHit,
  type SearchHitKind,
  type SearchPaletteProps,
} from './db/SearchPalette';
export { SqlEditor, type SqlEditorProps, type BookmarkMap } from './db/SqlEditor';
export { SqlHighlight, type SqlHighlightProps } from './db/SqlHighlight';
export {
  ShortcutsCheatSheet,
  type ShortcutsCheatSheetProps,
} from './db/ShortcutsCheatSheet';
export {
  getAltKeyLabel,
  getModKeyLabel,
  getShiftKeyLabel,
  isMac,
  isTypingTarget,
} from './platform';
export { BrandIcon, type BrandIconProps } from './BrandIcon';
export {
  useEditorStore,
  type EditorFontSize,
  type EditorTabSize,
  type EditorState as EditorSettingsState,
} from './db/editor-store';
export {
  useDisplayStore,
  type CsvDelimiter,
  type DateFormat,
  type DisplayState,
  type ExportFormat,
} from './db/display-store';
export {
  useConnectionPrefs,
  resolveHistoryLimit,
  type ConnectionPrefsState,
  type QueryHistoryLimit,
} from './db/connection-prefs';
export {
  ToastViewport,
  type ToastViewportProps,
} from './toast/ToastViewport';
export {
  TOAST_TTL_MS,
  useToastStore,
  type Toast,
  type ToastStore,
  type ToastStoreActions,
} from './toast/toast-store';
export {
  mutationKind,
  notifyMutations,
  notifySingleMutation,
  previewSql,
  type MutationKind,
} from './toast/notify';
export { formatDateCell } from './db/date-format';
export {
  DatabaseExportModal,
  type DatabaseExportModalProps,
} from './db/DatabaseExportModal';
export {
  runDatabaseExport,
  targetTables,
  type DatabaseExportProgress,
  type RunDatabaseExportArgs,
  type TableExportPart,
} from './db/database-export';
export {
  defaultExportFilename,
  exportStamp,
  mimeFor,
  triggerBlobDownload,
  type StreamedCsvDelimiter,
  type StreamedExportFormat,
  type StreamedExportRequest,
  type StreamedExportResult,
  type StreamedExportRunner,
  type StreamedExportScope,
} from './db/streamed-export';
export {
  SETTINGS_EXPORT_VERSION,
  applySettings,
  downloadSettings,
  gatherSettings,
  parseSettings,
  serializeSettings,
  validateSettings,
  type ExportedSettings,
  type ValidationResult as SettingsValidationResult,
} from './settings-io';
export { StatsDashboard, type StatsDashboardProps } from './db/StatsDashboard';
export {
  useHealthProbe,
  type HealthProbeTab,
  type HealthPatch,
  type UseHealthProbeOptions,
} from './db/use-health-probe';
export {
  TableContextMenu,
  type SchemaMenuItem,
  type TableContextMenuProps,
} from './db/TableContextMenu';
export {
  quoteIdent,
  schemaDdl,
  sourceQuery,
  type DdlSourceKind,
  type SchemaDdl,
} from './db/schema-actions';
export {
  DdlViewerModal,
  type DdlViewerModalProps,
} from './db/DdlViewerModal';
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
  swatchFor,
  type AccentDef,
  type AccentId,
} from './theme/accent-colors';
export {
  applyThemeToDocument,
  resolveThemeMode,
  useResolvedThemeMode,
  useThemeStore,
  type ResolvedThemeMode,
  type ThemeMode,
  type ThemeState,
} from './theme/theme-store';
export {
  SettingsButton,
  type SettingsButtonProps,
  SettingsPage,
  type SettingsPageProps,
  SettingsPanel,
  type SettingsPanelProps,
} from './theme/SettingsPanel';
export {
  WelcomeDashboard,
  type WelcomeDashboardProps,
} from './db/WelcomeDashboard';
export {
  StatusBar,
  type StatusBarAttribution,
  type StatusBarProps,
} from './db/StatusBar';
export {
  RECENT_MAX,
  selectRecent,
  useRecentQueries,
  type RecentQueriesStore,
  type RecentQuery,
} from './db/recent-queries';
export { ResultTable, type ResultTableProps } from './db/ResultTable';
export { BlobViewer, type BlobViewerProps } from './db/BlobViewer';
export { RowEditorModal, type RowEditorModalProps } from './db/RowEditorModal';
export { sniffBlob, decodeHex, bytesToBase64, type BlobMime } from './db/blob-sniff';
export { MultiResultView, type MultiResultViewProps } from './db/MultiResultView';
export {
  TableObjectView,
  type TableObjectViewProps,
  buildCreateTableDdl,
} from './db/TableObjectView';
