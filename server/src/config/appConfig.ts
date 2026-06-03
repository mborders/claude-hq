import path from 'node:path';
import type { AppConfig } from '@ccm/shared';
import { readText, writeAtomic } from '../fs/safeFs';
import { appConfigSchema } from '../schemas';
import type { ServerEnv } from '../env';

/** Loads/saves the tool's own state in APP_DATA_DIR/config.json (never in ~/.claude). */
export class AppConfigStore {
  private readonly file: string;

  constructor(private readonly env: ServerEnv) {
    this.file = path.join(env.appDataDir, 'config.json');
  }

  defaults(): AppConfig {
    return {
      version: 1,
      scanRoots: [...this.env.projectsRoots],
      manualProjects: [],
      hiddenProjects: [],
      theme: 'system',
      revealSecrets: false,
    };
  }

  load(): AppConfig {
    const r = readText(this.file);
    if (r) {
      try {
        return appConfigSchema.parse(JSON.parse(r.content));
      } catch {
        /* corrupt — fall back to defaults without clobbering the file */
      }
    }
    return this.defaults();
  }

  save(cfg: AppConfig): AppConfig {
    const valid = appConfigSchema.parse(cfg);
    writeAtomic(this.file, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 });
    return valid;
  }

  update(patch: Partial<AppConfig>): AppConfig {
    return this.save({ ...this.load(), ...patch, version: 1 });
  }
}
