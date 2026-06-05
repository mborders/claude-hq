import fs from 'node:fs';
import { buildApp } from './app';
import { loadEnv } from './env';

async function main(): Promise<void> {
  const env = loadEnv();

  // Ensure the app's own writable data dir exists (config + backups).
  fs.mkdirSync(env.appDataDir, { recursive: true });

  // Warn early (not fatal) if the global config mount looks wrong.
  if (!fs.existsSync(env.claudeHomeDir)) {
    console.warn(
      `[ccm] CLAUDE_HOME_DIR does not exist: ${env.claudeHomeDir}\n` +
        `      The global scope will appear empty until this path is mounted/created.`,
    );
  }

  const app = await buildApp({ env });

  try {
    await app.listen({ port: env.port, host: env.host });
    app.log.info(
      { claudeHome: env.claudeHomeDir, projectsRoots: env.projectsRoots, readOnly: env.readOnly },
      `Claude Control listening on http://${env.host}:${env.port}`,
    );
  } catch (err) {
    // Friendly startup errors — visible even when the logger is silent (npx CLI).
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EADDRINUSE') {
      console.error(`\n  Port ${env.port} is already in use — try a different port (e.g. --port ${env.port + 1}).\n`);
    } else if (e.code === 'EACCES') {
      console.error(`\n  Permission denied binding ${env.host}:${env.port}.\n`);
    } else {
      console.error(`\n  Failed to start: ${e.message ?? err}\n`);
    }
    process.exit(1);
  }
}

void main();
