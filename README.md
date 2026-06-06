# Claude HQ

A sleek, local web tool for managing your **Claude Code** configuration — both the
global user config (`~/.claude/`) and per-project config (`<project>/.claude/`) —
from one intuitive interface. Edit permissions, memory, subagents, slash commands,
skills, MCP servers, hooks, and plugins with smart forms, a raw escape hatch,
automatic backups, and validation before every write.

> Built with React + Vite + TypeScript + Tailwind on the front, a small Fastify +
> TypeScript API on the back, shipped as a single Docker image.

---

## Highlights

- **Two scopes, one UI** — switch between your **Global** config and any **project**
  under a configurable root. Projects are auto-discovered (with a "has `.claude/`"
  badge) and you can add any directory manually.
- **Permissions, done right** — a dedicated allow/deny editor with rules grouped by
  tool, a rule builder, live search, and confirmation prompts before granting broad
  access. Editing permissions never drops your other settings.
- **Everything else** — Settings, Memory (`CLAUDE.md`), Subagents, Slash commands,
  Skills, MCP servers, Hooks, and Plugins/Marketplaces — each with friendly forms
  **and** a raw JSON/Markdown editor (CodeMirror) you can drop into anytime.
- **Safe by construction** — every write is validated, runs through a path sandbox,
  and is preceded by a **timestamped backup** you can restore. Secrets (`env`
  values, MCP auth headers) are redacted by default. Runtime data (sessions,
  metrics, credentials) is strictly read-only.
- **Warm, fast, keyboard-friendly** — a distinctive "Warm Clay" design with light &
  dark themes, a ⌘K command palette, and an app-wide unsaved-changes guard.

---

## Run it instantly (npx)

No clone, no Docker — just Node 20+:

```bash
npx claude-hq
```

That starts the server and opens the UI in your browser. By default it scans the
**current directory** for projects, reads your global config from `~/.claude`,
and keeps its own config + backups in `~/.claude-hq`. Everything is
configurable:

```bash
npx claude-hq --port 9000 --workspace ~/code
npx claude-hq --claude-home ~/.claude --read-only
npx claude-hq --help
```

| Flag | Purpose | Default |
|---|---|---|
| `-p, --port <n>` | Port to listen on | `7878` |
| `--host <addr>` | Interface to bind | `127.0.0.1` |
| `-w, --workspace <dir>` | Folder that holds your projects | current directory |
| `--claude-home <dir>` | Your global `~/.claude` | `~/.claude` |
| `--data-dir <dir>` | Where to keep config + backups | `~/.claude-hq` |
| `--read-only` | Refuse all writes (view-only) | off |
| `--no-open` | Don't open the browser | opens by default |

---

## Quick start (Docker)

Requirements: Docker + Docker Compose.

```bash
git clone <this-repo> && cd claude-hq

# One-time: seed your host UID/GID into .env (so files stay owned by you) and
# create the app-data directory. (make setup does this for you.)
make setup

# Build + run
make up            # == docker compose up -d --build

open http://localhost:7878
```

That's it. The container mounts your `~/.claude` and `~/Documents/GitHub` (by
default) and serves the UI + API on port 7878.

To stop: `make down`. To see logs: `make logs`.

### Pointing at different paths

Edit `.env` (copied from `.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `HOST_PORT` | Port on your machine | `7878` |
| `HOST_CLAUDE_HOME` | Global config to mount | `~/.claude` |
| `HOST_PROJECTS_ROOT` | Projects root to scan | `~/Documents/GitHub` |
| `READ_ONLY` | `true` disables all writes | `false` |
| `UID` / `GID` | Your host user (for correct file ownership) | seeded by `make setup` |

**Protect your global config:** for a read-only mount at the kernel level, change
mount (1) in `docker-compose.yml` to end with `:ro`, and/or set `READ_ONLY=true`.
Multiple project roots are supported — see the comments in `docker-compose.yml`.

---

## Local development (no Docker)

Requirements: Node 22 (`nvm use`).

```bash
npm install
npm run dev        # Vite UI on :5173 (or next free port) + API on :7878
```

The Vite dev server proxies `/api` to the API, which reads your real `~/.claude`
and `~/Documents/GitHub` directly. Useful scripts:

```bash
npm test           # vitest (fs/security core + API integration)
npm run typecheck  # tsc across shared/server/web
npm run lint       # eslint
npm run build      # production build (web/dist + server/dist/server.cjs)
```

---

## How it works

```
claude-hq/
├── shared/   @claude-hq/shared — TypeScript wire contract (types + permission helpers)
├── server/   @claude-hq/server — Fastify API + static SPA host (bundled to one .cjs)
└── web/      @claude-hq/web    — React + Vite SPA
```

- **Single port, single process.** In production the Fastify server serves the
  built SPA and the `/api` JSON API on one port — clean to run and to healthcheck.
- **The server never executes anything.** It only reads and writes config *text*
  (no running of hooks, MCP commands, or git), which removes the biggest class of
  risk for a config editor.
- **The write pipeline** (every mutation) is:
  `sandbox-resolve → reject readonly → sha256 concurrency check → validate (zod)
  → backup → atomic write (temp file + rename, mode preserved)`.
- **Scopes** are opaque ids (`global` or `project:<base64url path>`), decoded and
  re-validated against an allow-list of mounted roots on every request.
- **Backups** live under `APP_DATA_DIR/backups/` (the mounted `./.appdata`),
  deliberately *outside* `~/.claude`, so they survive a read-only global mount and
  never collide with Claude Code's own backups.

### Safety notes

- Writes that grant broad access (e.g. `Bash(*)`, `Read(/**)`), clear all deny
  rules, delete an artifact, or restore a backup require explicit confirmation.
- Secrets are masked in responses by default; reveal is per-request and the raw
  file endpoint (the explicit escape hatch) is the only place unmasked text is
  returned.
- Concurrent/external edits are caught by a sha256 check — you'll be told if a file
  changed underneath you instead of clobbering it.

---

## Environment variables (server)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `7878` | Port the server binds |
| `CLAUDE_HOME_DIR` | `~/.claude` | Global config directory |
| `PROJECTS_ROOTS` | `~/Documents/GitHub` | `:`-separated roots to scan |
| `APP_DATA_DIR` | `./.appdata` | Tool's own config + backups |
| `READ_ONLY` | `false` | Refuse all writes when `true` |
| `WEB_DIST_DIR` | `<cwd>/web/dist` | Built SPA location |

---

## Publishing (maintainers)

The package ships the bundled server (`server/dist/server.cjs`) + built UI
(`web/dist`) + the CLI, so consumers never build. `prepublishOnly` runs the
build automatically.

```bash
npm login          # one-time
npm publish        # builds, then publishes claude-hq (public)
```

After that, anyone can `npx claude-hq`.

---

## License

MIT.
