#!/usr/bin/env node
'use strict';

// Thin CLI wrapper: map flags onto the env the server already reads, point it at
// the bundled UI, pick sensible no-clone defaults, then boot the server bundle.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

const PKG_ROOT = path.join(__dirname, '..');
const pkg = require(path.join(PKG_ROOT, 'package.json'));

const HELP = `
Claude HQ ${pkg.version} — a local web UI to manage Claude Code configuration.

Usage
  npx @matthewbborders/claude-hq [options]

Options
  -p, --port <n>          Port to listen on                  (default 7878)
      --host <addr>       Interface to bind                  (default 127.0.0.1)
  -w, --workspace <dir>   Folder that holds your projects    (default: current directory)
      --claude-home <dir> Your global ~/.claude directory    (default: ~/.claude)
      --data-dir <dir>    Where to keep config + backups     (default: ~/.claude-hq)
      --read-only         Refuse all writes (view-only)
      --no-open           Don't open the browser automatically
      --verbose           Print server logs (off by default)
  -h, --help              Show this help
  -v, --version           Show the version

Examples
  npx @matthewbborders/claude-hq
  npx @matthewbborders/claude-hq --port 9000 --workspace ~/code
  npx @matthewbborders/claude-hq --claude-home ~/.claude --read-only
`;

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-p':
      case '--port': opts.port = argv[++i]; break;
      case '--host': opts.host = argv[++i]; break;
      case '-w':
      case '--workspace': opts.workspace = argv[++i]; break;
      case '--claude-home': opts.claudeHome = argv[++i]; break;
      case '--data-dir': opts.dataDir = argv[++i]; break;
      case '--read-only': opts.readOnly = true; break;
      case '--open': opts.open = true; break;
      case '--no-open': opts.open = false; break;
      case '--verbose':
      case '--debug': opts.verbose = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      case '-v':
      case '--version': opts.version = true; break;
      default:
        process.stderr.write(`Unknown option: ${a}\nRun "claude-hq --help" for usage.\n`);
        process.exit(1);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (opts.version) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

// Resolve config: CLI flag > existing env var > no-clone default.
const env = process.env;
const host = opts.host || env.HOST || '127.0.0.1';
const port = Number(opts.port || env.PORT || 7878);
const webDist = env.WEB_DIST_DIR || path.join(PKG_ROOT, 'web', 'dist');

env.NODE_ENV = env.NODE_ENV || 'production';
env.HOST = host;
env.PORT = String(port);
env.WEB_DIST_DIR = webDist;
env.PROJECTS_ROOTS = opts.workspace || env.PROJECTS_ROOTS || process.cwd();
env.CLAUDE_HOME_DIR = opts.claudeHome || env.CLAUDE_HOME_DIR || path.join(os.homedir(), '.claude');
env.APP_DATA_DIR = opts.dataDir || env.APP_DATA_DIR || path.join(os.homedir(), '.claude-hq');
if (opts.readOnly) env.READ_ONLY = 'true';
// Quiet by default — the banner is the UI. --verbose surfaces server logs.
env.LOG_LEVEL = opts.verbose ? 'info' : env.LOG_LEVEL || 'silent';

const serverBundle = path.join(PKG_ROOT, 'server', 'dist', 'server.cjs');
if (!fs.existsSync(serverBundle) || !fs.existsSync(path.join(webDist, 'index.html'))) {
  process.stderr.write(
    'Built assets are missing. If you are running from a source checkout, run "npm run build" first.\n',
  );
  process.exit(1);
}

const browseHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
const url = `http://${browseHost}:${port}`;

// Boot the bundled server (its main() runs on require).
require(serverBundle);

waitForHealth(port, browseHost).then((ready) => {
  process.stdout.write(
    `\n  Claude HQ ${pkg.version}\n` +
      `  → ${url}\n` +
      `  workspace: ${env.PROJECTS_ROOTS}\n` +
      `  global:    ${env.CLAUDE_HOME_DIR}\n` +
      (env.READ_ONLY === 'true' ? '  mode:     read-only\n' : '') +
      '\n  Press Ctrl+C to stop.\n\n',
  );
  if (ready && opts.open !== false) openBrowser(url);
});

function waitForHealth(p, h, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get({ host: h, port: p, path: '/api/health', timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => (Date.now() - started > timeoutMs ? resolve(false) : setTimeout(tick, 150));
    tick();
  });
}

function openBrowser(target) {
  try {
    const [cmd, args] =
      process.platform === 'darwin'
        ? ['open', [target]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', target]]
          : ['xdg-open', [target]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* opening the browser is best-effort */
  }
}
