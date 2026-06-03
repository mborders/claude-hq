import { PathSandbox } from './fs/sandbox';
import { BackupStore } from './fs/backup';
import { FileService } from './services/fileService';
import { AppConfigStore } from './config/appConfig';
import type { ServerEnv } from './env';

export interface AppContext {
  env: ServerEnv;
  sandbox: PathSandbox;
  backups: BackupStore;
  files: FileService;
  appConfig: AppConfigStore;
}

export function createContext(env: ServerEnv): AppContext {
  const sandbox = new PathSandbox([env.claudeHomeDir, ...env.projectsRoots]);
  const backups = new BackupStore(env.appDataDir);
  return {
    env,
    sandbox,
    backups,
    files: new FileService(sandbox, backups, env),
    appConfig: new AppConfigStore(env),
  };
}
