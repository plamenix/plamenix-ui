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
  TxConfig,
  TxIsolation,
  TxLocking,
  TxMode,
  TxStatus,
} from './db/types';
export { renderCell, SUPPORTED_CHARSETS } from './db/types';
export {
  pickCellRenderer,
  type CellRendererContext,
  type CellRendererPayload,
} from './db/cell-renderer-contract';
export {
  pluginContributionsToExportButtons,
  type ExportButtonDefinition,
  type ExportFormatArgs,
  type ExportFormatPayload,
  type ExportFormatResult,
} from './db/export-format-contract';
export {
  pluginContributionsToCommands,
  type CommandContributionPayload,
} from './db/command-contract';
export {
  pluginContributionsToSidebarPanels,
  type SidebarPanelContributionPayload,
} from './plugins/sidebar-panel-contract';
export { flattenTipPacks, type TipPackContributionPayload } from './db/tip-pack-contract';
export {
  registerBuiltinFirebirdTips,
  unregisterBuiltinFirebirdTips,
} from './db/builtins/firebird-tips-pack';
export {
  pluginContributionsToSchemaActions,
  type SchemaActionContext,
  type SchemaActionContributionPayload,
  type SchemaActionDescriptor,
  type SchemaObjectKind,
} from './db/schema-action-contract';
export { registerBuiltinDbaToolbox, unregisterBuiltinDbaToolbox } from './db/builtins/dba-toolbox';
export {
  buildCsvBody,
  registerBuiltinCsvExport,
  unregisterBuiltinCsvExport,
} from './db/builtins/csv-export';
export {
  buildJsonBody,
  registerBuiltinJsonExport,
  unregisterBuiltinJsonExport,
} from './db/builtins/json-export';
export {
  buildSqlBody,
  registerBuiltinSqlExport,
  unregisterBuiltinSqlExport,
} from './db/builtins/sql-export';
export {
  buildXmlBody,
  registerBuiltinXmlExport,
  unregisterBuiltinXmlExport,
} from './db/builtins/xml-export';
export {
  buildXlsxBlob,
  registerBuiltinXlsxExport,
  unregisterBuiltinXlsxExport,
} from './db/builtins/xlsx-export';
export {
  matchesCombo,
  parseCombo,
  pluginContributionsToKeybindings,
  type KeybindingContext,
  type KeybindingContributionPayload,
  type KeybindingDescriptor,
  type ParsedCombo,
} from './keybindings/keybinding-contract';
export { useGlobalKeybindings } from './keybindings/useGlobalKeybindings';
export {
  registerBuiltinDefaultKeybindings,
  unregisterBuiltinDefaultKeybindings,
  type DefaultKeybindingHandlers,
} from './keybindings/builtins/default-keybindings';
export {
  pluginContributionsToMenuItems,
  type MenuContext,
  type MenuContributionPayload,
  type MenuItemDescriptor,
} from './menus/menu-contract';
export {
  registerBuiltinSchemaContextMenu,
  unregisterBuiltinSchemaContextMenu,
  SCHEMA_MENU_HEADER_ICONS,
  SCHEMA_MENU_IDS,
  type SchemaContextMenuHandlers,
  type SchemaMenuId,
} from './menus/builtins/schema-context-menu';
export {
  pluginContributionsToToolbarButtons,
  type ToolbarButtonContributionPayload,
  type ToolbarButtonDescriptor,
  type ToolbarButtonVariant,
  type ToolbarContext,
  type ToolbarLocation,
} from './toolbar/toolbar-button-contract';
export { ToolbarSlot, type ToolbarSlotProps } from './toolbar/ToolbarSlot';
export {
  pluginContributionsToInspectorTabs,
  type ObjectInspectorContext,
  type ObjectInspectorContributionPayload,
  type ObjectInspectorHostHelpers,
  type ObjectInspectorTabDescriptor,
} from './inspectors/object-inspector-contract';
export {
  registerBuiltinTableInspectorTabs,
  unregisterBuiltinTableInspectorTabs,
} from './inspectors/builtins/table-inspector-tabs';
export {
  pickSqlFormatter,
  pluginContributionsToSqlFormatters,
  type SqlDialect,
  type SqlFormatterContributionPayload,
  type SqlFormatterDescriptor,
} from './formatters/sql-formatter-contract';
export {
  formatSqlBasic,
  registerBuiltinBasicSqlFormatter,
  unregisterBuiltinBasicSqlFormatter,
} from './formatters/builtins/basic-formatter';
export {
  pluginContributionsToAuthProviders,
  type AuthProviderContributionPayload,
  type AuthProviderDescriptor,
  type AuthProviderFormContext,
  type SecretBundle,
} from './auth/auth-provider-contract';
export {
  buildPasswordCredentials,
  registerBuiltinPasswordAuthProvider,
  unregisterBuiltinPasswordAuthProvider,
} from './auth/builtins/password-provider';
export {
  applyThemeCssVariables,
  pluginContributionsToThemes,
  resolveThemeAppearance,
  type ThemeContributionPayload,
  type ThemeDescriptor,
  type ThemeMode as PluginThemeMode,
} from './theme/theme-contract';
export {
  registerBuiltinDefaultThemes,
  unregisterBuiltinDefaultThemes,
} from './theme/builtins/default-themes';
export {
  pluginContributionsToSettingsPanels,
  type SettingsPanelContributionPayload,
  type SettingsPanelDescriptor,
} from './settings-panels/settings-panel-contract';
export {
  registerBuiltinDefaultSettingsSections,
  unregisterBuiltinDefaultSettingsSections,
} from './settings-panels/builtins/default-sections';
export {
  pluginContributionsToDashboardSections,
  type DashboardContext,
  type DashboardSectionContributionPayload,
  type DashboardSectionDescriptor,
} from './dashboard/dashboard-section-contract';
export {
  registerBuiltinDefaultDashboardSections,
  unregisterBuiltinDefaultDashboardSections,
} from './dashboard/builtins/default-sections';
export {
  pluginContributionsToStatusBarItems,
  statusBarItemsByAlignment,
  type StatusBarAlignment,
  type StatusBarContext,
  type StatusBarItemContributionPayload,
  type StatusBarItemDescriptor,
} from './status-bar/status-bar-item-contract';
export {
  registerBuiltinDefaultStatusBarItems,
  unregisterBuiltinDefaultStatusBarItems,
} from './status-bar/builtins/default-items';
export {
  pluginContributionsToCompletionProviders,
  runApplicableCompletionProviders,
  type CompletionProviderContext,
  type CompletionProviderContributionPayload,
  type CompletionProviderDescriptor,
  type CompletionScope,
} from './completions/completion-provider-contract';
export {
  firebirdKeywordsComplete,
  registerBuiltinFirebirdKeywordsCompletion,
  unregisterBuiltinFirebirdKeywordsCompletion,
} from './completions/builtins/firebird-keywords';
export {
  lineColToOffset,
  pluginContributionsToDiagnosticProviders,
  runDiagnosticProviders,
  type DiagnosticProviderContributionPayload,
  type DiagnosticProviderDescriptor,
  type DiagnosticSeverity,
  type PlamenixDiagnostic,
} from './diagnostics/diagnostic-provider-contract';
export {
  basicSyntaxLint,
  registerBuiltinBasicSyntaxDiagnostic,
  unregisterBuiltinBasicSyntaxDiagnostic,
} from './diagnostics/builtins/basic-syntax';
export {
  pluginContributionsToImportSources,
  type ImportContext,
  type ImportRowsArgs,
  type ImportSourceContributionPayload,
  type ImportSourceDescriptor,
  type ImportSourceFormProps,
} from './imports/import-source-contract';
export {
  importCsvRows,
  parseCsvText,
  registerBuiltinCsvImporter,
  unregisterBuiltinCsvImporter,
  type CsvImportState,
} from './imports/builtins/csv-importer';
export { ImportWizardModal, type ImportWizardModalProps } from './imports/ImportWizardModal';
export {
  EventBus,
  eventBus,
  matchesPattern,
  tokenisePattern,
  type Disposable as PluginEventDisposable,
  type EventHandler as PluginEventHandler,
} from './events/event-bus';
export { useEventSubscription } from './events/useEventSubscription';
export {
  APP_SHUTDOWN,
  APP_STARTED,
  PLUGIN_ACTIVATED,
  PLUGIN_CRASHED,
  PLUGIN_DEACTIVATED,
  emitAppShutdown,
  emitAppStarted,
  emitPluginActivated,
  emitPluginCrashed,
  emitPluginDeactivated,
  useEmitLifecycleEvents,
  type AppShutdownPayload,
  type AppStartedPayload,
  type PluginActivatedPayload,
  type PluginCrashedPayload,
  type PluginDeactivatedPayload,
  type UseEmitLifecycleEventsOptions,
} from './events/lifecycle-events';
export {
  TAB_ACTIVATED,
  TAB_CLOSED,
  TAB_OPENED,
  TAB_RENAMED,
  diffAndEmitTabEvents,
  emitTabActivated,
  emitTabClosed,
  emitTabOpened,
  emitTabRenamed,
  useEmitTabEvents,
  type TabActivatedPayload,
  type TabClosedPayload,
  type TabOpenedPayload,
  type TabRenamedPayload,
  type TabSnapshot,
  type TabStateSnapshot,
} from './events/tab-events';
export {
  CONNECTION_CLOSED,
  CONNECTION_FAILED,
  CONNECTION_HEALTH_CHANGED,
  CONNECTION_OPENED,
  diffAndEmitConnectionEvents,
  emitConnectionClosed,
  emitConnectionFailed,
  emitConnectionHealthChanged,
  emitConnectionOpened,
  useEmitConnectionEvents,
  type ConnectionClosedPayload,
  type ConnectionFailedPayload,
  type ConnectionHealth,
  type ConnectionHealthChangedPayload,
  type ConnectionOpenedPayload,
  type ConnectionSnapshot,
} from './events/connection-events';
export {
  QUERY_EXECUTED,
  QUERY_FAILED,
  diffAndEmitQueryEvents,
  emitQueryExecuted,
  emitQueryFailed,
  useEmitQueryEvents,
  type QueryExecutedPayload,
  type QueryFailedPayload,
  type QuerySnapshot,
} from './events/query-events';
export {
  CELL_COMMITTED,
  ROW_DELETED,
  ROW_INSERTED,
  emitCellCommitted,
  emitRowDeleted,
  emitRowInserted,
  type CellCommittedPayload,
  type RowDeletedPayload,
  type RowInsertedPayload,
} from './events/data-events';
export {
  SCHEMA_ACTION_APPLIED,
  SCHEMA_DESCRIBED,
  diffAndEmitSchemaEvents,
  emitSchemaActionApplied,
  emitSchemaDescribed,
  useEmitSchemaEvents,
  type SchemaActionAppliedPayload,
  type SchemaDescribedPayload,
  type SchemaSnapshot,
} from './events/schema-events';
export {
  EXPORT_COMPLETED,
  EXPORT_FAILED,
  EXPORT_STARTED,
  emitExportCompleted,
  emitExportFailed,
  emitExportStarted,
  newExportId,
  type ExportCompletedPayload,
  type ExportFailedPayload,
  type ExportScopeKind,
  type ExportStartedPayload,
} from './events/export-events';
export {
  SETTINGS_CHANGED,
  THEME_CHANGED,
  diffAndEmitSettingsChanges,
  diffAndEmitThemeChange,
  emitSettingsChanged,
  emitThemeChanged,
  useEmitSettingsThemeEvents,
  type DisplaySettingKey,
  type DisplaySettingsSnapshot,
  type EditorSettingKey,
  type EditorSettingsSnapshot,
  type SettingsChangedPayload,
  type SettingsScope,
  type ThemeChangedPayload,
  type ThemeSnapshot,
} from './events/settings-theme-events';
export {
  EDITOR_CHANGED,
  EDITOR_FOCUSED,
  EDITOR_SAVED,
  EDITOR_SELECTION_CHANGED,
  diffAndEmitEditorEvents,
  emitEditorChanged,
  emitEditorFocused,
  emitEditorSaved,
  emitEditorSelectionChanged,
  useEmitEditorEvents,
  type EditorChangedPayload,
  type EditorFocusedPayload,
  type EditorSavedPayload,
  type EditorSelectionChangedPayload,
  type EditorSnapshot,
} from './events/editor-events';
export {
  InterceptorChain,
  type InterceptorDecision,
  type InterceptorHandler,
  type InterceptorRegistration,
  type InterceptorRunOptions,
  type InterceptorUseOptions,
} from './interceptors/chain';
export {
  __hasConfirmationProvider,
  installDestructiveDropInterceptor,
  isDestructiveSql,
  queryExecutingChain,
  setConfirmationProvider,
  type ConfirmationProvider,
  type ConfirmationRequest,
  type QueryExecutingContext,
} from './interceptors/query-executing';
export { cellCommittingChain, type CellCommittingContext } from './interceptors/cell-committing';
export {
  rowInsertingChain,
  type RowInsertColumnValue,
  type RowInsertingContext,
} from './interceptors/row-inserting';
export { rowDeletingChain, type RowDeletingContext } from './interceptors/row-deleting';
export {
  connectionOpeningChain,
  type ConnectionOpeningContext,
} from './interceptors/connection-opening';
export { exportStartingChain, type ExportStartingContext } from './interceptors/export-starting';
export { editorSavingChain, type EditorSavingContext } from './interceptors/editor-saving';
export {
  schemaActionApplyingChain,
  type SchemaActionApplyingContext,
} from './interceptors/schema-action-applying';
export {
  installPluginInterceptors,
  type ExtensionPoint,
  type InstallPluginInterceptorsOptions,
  type PluginInterceptorOutcome,
  type PluginInterceptorTransport,
} from './interceptors/plugin-bridge';
export { Field, type FieldProps } from './db/Field';
export { ConnectionPanel, type ConnectionPanelProps } from './db/ConnectionPanel';
export { ConnectionScreen, type ConnectionScreenProps } from './db/ConnectionScreen';
export { CommandPalette, type Command, type CommandPaletteProps } from './db/CommandPalette';
export { HistoryPanel, type HistoryPanelProps } from './db/HistoryPanel';
export { ErrorBanner, type ErrorBannerProps } from './db/ErrorBanner';
export { PluginsSidebar, type PluginsSidebarProps } from './plugins/PluginsSidebar';
export { buildBuiltinActivePlugins } from './plugins/builtin-active-plugins';
export { PluginsButton, type PluginsButtonProps } from './plugins/PluginsButton';
export { PluginsPage, type PluginsPageProps } from './plugins/PluginsPage';
export {
  registerBuiltinPluginSettings,
  unregisterBuiltinPluginSettings,
} from './plugins/builtin-plugin-settings';
export { AboutButton, type AboutButtonProps } from './about/AboutButton';
export { AboutPage, type AboutPageProps } from './about/AboutPage';
export { FilterBuilderModal, type FilterBuilderModalProps } from './db/FilterBuilderModal';
export { HomeButton, type HomeButtonProps } from './db/HomeButton';
export { AppMenu, type AppMenuItem, type AppMenuProps } from './db/AppMenu';
export {
  FirstUsePermissionPrompt,
  type FirstUsePermissionPromptProps,
  type FirstUsePermissionRequest,
} from './plugins/FirstUsePermissionPrompt';
export { PermissionsPanel, type PermissionsPanelProps } from './plugins/PermissionsPanel';
export {
  PluginInstallDialog,
  SignatureBanner,
  type PendingPluginInstall,
  type PluginInstallDialogProps,
  type PluginSignatureState,
} from './plugins/PluginInstallDialog';
export {
  PluginUninstallConfirmation,
  formatStorageSize,
  type PendingPluginUninstall,
  type PluginUninstallConfirmationProps,
} from './plugins/PluginUninstallConfirmation';
export {
  usePluginInstallFlow,
  type PluginInstallAdapters,
  type PluginInstallPhase,
  type PluginInstallState,
  type UsePluginInstallFlowResult,
} from './plugins/use-plugin-install-flow';
export { PluginPanelModal, type PluginPanelModalProps } from './plugins/PluginPanelModal';
export type {
  ActivePlugin,
  ActivationInfo,
  PluginCrashBudgetInfo,
  PluginDisableReason,
  PluginLogEntry,
  PluginRestartPolicy,
  PluginStatus,
  PluginSupervisionInfo,
  SidebarPanelInfo,
} from './plugins/types';
export { parseFirebirdError, errorKindLabel, type FirebirdErrorInfo } from './db/error-info';
export { CryptBadge, type CryptBadgeProps } from './db/CryptBadge';
export { ProfilePicker, type ProfilePickerProps } from './db/ProfilePicker';
export { QueryPanel, type QueryPanelProps, type SessionHealth } from './db/QueryPanel';
export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type OrderBy,
  type Pagination,
  type SortDirection,
} from './db/pagination';
export { SchemaBrowser, type SchemaBrowserProps } from './db/SchemaBrowser';
export { ObjectListPage, type ObjectListKind, type ObjectListPageProps } from './db/ObjectListPage';
export { NewObjectModal, type NewObjectKind, type NewObjectModalProps } from './db/NewObjectModal';
export { SchemaEditorModal, type SchemaEditorModalProps } from './db/SchemaEditorModal';
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
export { ShortcutsCheatSheet, type ShortcutsCheatSheetProps } from './db/ShortcutsCheatSheet';
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
export { ToastViewport, type ToastViewportProps } from './toast/ToastViewport';
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
  ConfirmationModal,
  type ConfirmationModalProps,
  type PendingConfirmation,
} from './db/ConfirmationModal';
export { DatabaseExportModal, type DatabaseExportModalProps } from './db/DatabaseExportModal';
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
  useConnectionActions,
  type ConnectionActions,
  type ConnectionAdapter,
  type ConnectionPatch,
  type ConnectionTab,
  type ConnectRequest,
  type UseConnectionActionsOptions,
} from './db/use-connection-actions';
export { useShellCommands, type ShellCommandOptions } from './db/use-shell-commands';
export {
  firstAffected,
  firstRows,
  resolveStatement,
  type RowsResult,
  type StatementDecision,
  type StatementIntent,
} from './db/statement-pipeline';
export {
  dispatchSchemaDdl,
  type DdlDispatchOptions,
  type DdlTabPatch,
} from './db/dispatch-ddl';
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
export { DdlViewerModal, type DdlViewerModalProps } from './db/DdlViewerModal';
export { TabStrip, type TabStripProps } from './db/TabStrip';
export {
  DEFAULT_FORM,
  useTabsStore,
  type TabState,
  type TabsStore,
  type TabsStoreActions,
} from './db/tabs-store';

export { ACCENT_COLORS, swatchFor, type AccentDef, type AccentId } from './theme/accent-colors';
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
export { WelcomeDashboard, type WelcomeDashboardProps } from './db/WelcomeDashboard';
export { StatusBar, type StatusBarAttribution, type StatusBarProps } from './db/StatusBar';
export {
  RECENT_MAX,
  selectRecent,
  useRecentQueries,
  type RecentQueriesStore,
  type RecentQuery,
} from './db/recent-queries';
export { ResultTable, type ResultTableProps } from './db/ResultTable';
export { TransactionBar, type TransactionBarProps } from './db/TransactionBar';
export {
  TX_LINGERING_MS,
  TX_STALE_MS,
  describeTxStatus,
  formatTxAge,
  hasUncommittedWork,
  txAgeLevel,
  txAgeWarning,
  type TxAgeLevel,
} from './db/transaction-status';
export { BlobViewer, type BlobViewerProps } from './db/BlobViewer';
export { RowEditorModal, type RowEditorModalProps } from './db/RowEditorModal';
export { sniffBlob, decodeHex, bytesToBase64, type BlobMime } from './db/blob-sniff';
export { MultiResultView, type MultiResultViewProps } from './db/MultiResultView';
export {
  TableObjectView,
  type TableObjectViewProps,
  buildCreateTableDdl,
} from './db/TableObjectView';
export { RoutineObjectView, type RoutineObjectViewProps } from './db/RoutineObjectView';
export { SqlEditorPage, type SqlEditorPageProps } from './db/SqlEditorPage';
