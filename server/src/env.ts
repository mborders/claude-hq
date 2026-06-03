import os from 'node:os';
import path from 'node:path';

export interface ServerEnv {
  port: number;
  host: string;
  /** Absolute path to the mounted global `~/.claude` directory. */
  claudeHomeDir: string;
  /** Absolute paths to scan for project-level `.claude/` directories. */
  projectsRoots: string[];
  /** Writable dir for the tool's own config + timestamped backups (kept OUT of ~/.claude). */
  appDataDir: string;
  /** Absolute path to the built SPA (web/dist). */
  webDistDir: string;
  /** When true, all write endpoints are refused (defense-in-depth). */
  readOnly: boolean;
  nodeEnv: string;
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** Parse + normalize environment into a typed config. Pure (no fs side effects). */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const home = os.homedir();

  const claudeHomeDir = path.resolve(expandHome(env.CLAUDE_HOME_DIR || path.join(home, '.claude')));

  const projectsRoots = (env.PROJECTS_ROOTS || path.join(home, 'Documents', 'GitHub'))
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(expandHome(p)));

  const appDataDir = path.resolve(expandHome(env.APP_DATA_DIR || path.join(process.cwd(), '.appdata')));

  const webDistDir = path.resolve(
    expandHome(env.WEB_DIST_DIR || path.join(process.cwd(), 'web', 'dist')),
  );

  return {
    port: Number(env.PORT || 7878),
    host: env.HOST || '0.0.0.0',
    claudeHomeDir,
    projectsRoots,
    appDataDir,
    webDistDir,
    readOnly: toBool(env.READ_ONLY, false),
    nodeEnv: env.NODE_ENV || 'development',
  };
}
