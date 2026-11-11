/**
 * theme-sdk — what native themes build against.
 * Milestone 5 fills this in: typed /api/user client, session hooks and
 * dark-mode helpers, so theme authors never handle tokens or refresh logic.
 */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  entry: string;
  supportsDarkMode?: boolean;
  configSchema?: Record<string, unknown>;
}
