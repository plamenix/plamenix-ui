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
