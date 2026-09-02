/** Mirrors `plamenix-desktop::plugins::ActivePlugin`. */
export interface ActivePlugin {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  sidebarPanels: SidebarPanelInfo[];
  logs: PluginLogEntry[];
  activation: ActivationInfo;
  /** Permissions the plugin's manifest declares as required. */
  requiredPermissions: string[];
  /** Permissions the plugin's manifest declares as optional. */
  optionalPermissions: string[];
  /** Permissions currently granted by the user (persisted to disk). */
  grantedPermissions: string[];
  /** Required permissions still awaiting a user grant. */
  pendingPermissions: string[];
  /** Supervisor-side runtime state. Optional — absent while the
   *  shell is still pre-supervisor (legacy hosts) or when the host
   *  hasn't surfaced the data yet. Mirrors
   *  `plamenix-plugin-host::PluginSupervisionState`. */
  supervision?: PluginSupervisionInfo;
  /** Non-sidebar contribution counts per extension point. Built-in
   *  plugins surface their contributions through this field; wasm
   *  plugins typically leave it absent and contribute only through
   *  `sidebarPanels`. */
  extensions?: PluginExtensionCount[];
}

/** A single non-sidebar contribution-count row used by built-in
 *  plugins to expose what they register. The shape mirrors what
 *  `PluginsSidebar` renders below the sidebar-panels block. */
export interface PluginExtensionCount {
  /** Extension-point name from `@plamenix/ui/plugin-react`. */
  point: string;
  /** Number of contributions the plugin registered at this point. */
  count: number;
}

/** Lifecycle status mirroring `plamenix-plugin-host::PluginStatus`. */
export type PluginStatus =
  | 'loaded'
  | 'active'
  | 'crashing'
  | 'stopped'
  | 'disabled';

/** Restart policy mirroring `plamenix-plugin-host::RestartPolicy`. */
export type PluginRestartPolicy = 'permanent' | 'transient' | 'temporary';

/** Reason a plugin entered the `disabled` state. Mirrors
 *  `plamenix-plugin-host::DisableReason`. */
export type PluginDisableReason = 'crash-budget-exhausted';

/** Crash budget snapshot at the moment the host polled the
 *  supervisor. `used` is the count of crashes within the window;
 *  `max` is the cap (3 by default); `windowSecs` is the rolling
 *  window length (60 by default). */
export interface PluginCrashBudgetInfo {
  used: number;
  max: number;
  windowSecs: number;
}

/** Supervisor view of one plugin. */
export interface PluginSupervisionInfo {
  status: PluginStatus;
  restartPolicy: PluginRestartPolicy;
  /** Number of restarts the supervisor has performed so far. */
  restartCount: number;
  crashBudget: PluginCrashBudgetInfo;
  /** Present only when `status === 'disabled'`. */
  disableReason?: PluginDisableReason;
}

/** One declared sidebar-panel contribution. */
export interface SidebarPanelInfo {
  id: string;
  label: string;
  icon?: string | null;
}

/** One log line emitted by the plugin during `activate()`. */
export interface PluginLogEntry {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

/** Tagged activation outcome. */
export type ActivationInfo =
  | { status: 'ok' }
  | { status: 'failed'; message: string };
