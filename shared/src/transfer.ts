import type { HookRow } from './artifacts';

export type TransferType = 'agents' | 'commands' | 'skills' | 'mcp' | 'hooks' | 'plugins';
export type TransferMode = 'move' | 'copy';

export interface TransferRequest {
  type: TransferType;
  fromScopeId: string;
  toScopeId: string;
  mode: TransferMode;
  /** Required for overwriting an existing destination item. */
  confirm?: boolean;
  // --- identity (varies by type) ---
  /** agents / commands / skills */
  name?: string;
  /** mcp server id */
  id?: string;
  /** plugins, "<name>@<marketplace>" */
  pluginId?: string;
  /** hooks — the specific row to transfer */
  hook?: HookRow;
}

export interface TransferResult {
  ok: boolean;
  /** Destination scope-relative path written (file-based types). */
  destRelPath?: string;
  /** Whether the source copy was removed (move). */
  removedFromSource: boolean;
}
