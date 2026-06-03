import {
  LayoutDashboard,
  SlidersHorizontal,
  ShieldCheck,
  BookText,
  Bot,
  SquareSlash,
  Sparkles,
  Plug,
  Webhook,
  Blocks,
  type LucideIcon,
} from 'lucide-react';

export interface ModuleDef {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Which scope kinds show this module. */
  scopes: ('global' | 'project')[];
}

export const MODULES: ModuleDef[] = [
  { id: 'overview', label: 'Overview', path: 'overview', icon: LayoutDashboard, scopes: ['global', 'project'] },
  { id: 'settings', label: 'Settings', path: 'settings', icon: SlidersHorizontal, scopes: ['global', 'project'] },
  { id: 'permissions', label: 'Permissions', path: 'permissions', icon: ShieldCheck, scopes: ['global', 'project'] },
  { id: 'memory', label: 'Memory', path: 'memory', icon: BookText, scopes: ['global', 'project'] },
  { id: 'agents', label: 'Subagents', path: 'agents', icon: Bot, scopes: ['global', 'project'] },
  { id: 'commands', label: 'Slash commands', path: 'commands', icon: SquareSlash, scopes: ['global', 'project'] },
  { id: 'skills', label: 'Skills', path: 'skills', icon: Sparkles, scopes: ['global', 'project'] },
  { id: 'mcp', label: 'MCP servers', path: 'mcp', icon: Plug, scopes: ['global', 'project'] },
  { id: 'hooks', label: 'Hooks', path: 'hooks', icon: Webhook, scopes: ['global', 'project'] },
  { id: 'plugins', label: 'Plugins', path: 'plugins', icon: Blocks, scopes: ['global', 'project'] },
];
