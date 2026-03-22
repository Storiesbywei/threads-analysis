# Portability Guide — threads-analysis

Clone-and-run guide for setting up this project on a new Mac (tested on Apple Silicon).

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 22.x (LTS) | `brew install node@22` or [nvm](https://github.com/nvm-sh/nvm) |
| **Docker Desktop** | Latest | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Git** | Any recent | `brew install git` (or Xcode CLT) |

No `.nvmrc` or `.node-version` file exists yet. The Dockerfile pins `node:22-alpine`. Use Node 22.x to match.

---

## 5-Step Quickstart

```bash
# 1. Clone
git clone <repo-url> threads-analysis
cd threads-analysis

# 2. Install dependencies
npm install

# 3. Create .env (see template below)
cp docs/.env.template .env
# Edit .env with your actual values

# 4. Set up data files (see "Data Files" section below)
mkdir -p data/threads
# Either copy posts.json here or run a fresh sync

# 5. Start everything
docker compose up -d          # Postgres + sync worker
npm run analyze               # Generate post-tags.json + knowledge-graph.json
npm run dev                   # Astro dev server at localhost:4321
```

---

## .env Template

Create a `.env` file in the project root with these keys:

```bash
# ─── Threads API (required for sync) ────────────────────
THREADS_ACCESS_TOKEN=           # OAuth 2.0 long-lived token (60-day, refreshable)
APP_ID=                         # Threads app ID (Meta developer console)
THREADS_APP_ID=                 # Same as APP_ID (used by docker-compose)
APP_SECRETS=                    # App secret from Meta developer console
THREADS_USER_SECRETS=           # User-scoped secret
THREADS_USER_ID=25703740162660740   # @maybe_foucault user ID
MAYBE_FOUCAULT_THREADS_USER_TOKEN= # Alias for access token (legacy scripts)

# ─── PostgreSQL ─────────────────────────────────────────
POSTGRES_PASSWORD=threads_local_dev     # Default works for local dev
POSTGRES_USER=threads                   # Default works for local dev
POSTGRES_DB=threads                     # Default works for local dev
POSTGRES_HOST=localhost                 # Use "localhost" for local, "postgres" inside Docker
POSTGRES_PORT=5433                      # Docker maps 5433 -> container 5432
DATABASE_URL=postgres://threads:threads_local_dev@localhost:5433/threads

# ─── Sync Worker (optional, all have defaults) ─────────
SYNC_INTERVAL_MINUTES=30                # How often the worker syncs (minutes)
METRICS_BATCH_SIZE=200                  # Posts per metrics fetch cycle
FULL_SYNC_ON_START=false                # Set true for first run to backfill everything
```

**Getting a Threads API token:** Register an app at [developers.facebook.com](https://developers.facebook.com/), add the Threads API product, generate a short-lived token, then exchange it for a long-lived token (valid 60 days, refreshable). See `docs/threads-api-reference.md` for full details.

---

## Data Files

Two data files are symlinked to the ByTheWeiCo project and will be broken on a fresh clone.

### `data/threads/posts.json` (23 MB, ~46K posts)

This is the raw corpus. You have three options:

1. **Fresh sync** (recommended for a clean start):
   ```bash
   # Set FULL_SYNC_ON_START=true in .env, then:
   docker compose up -d
   # The sync worker will fetch all posts from the API
   # This takes a while due to API rate limits
   ```

2. **Copy the file** from another machine:
   ```bash
   scp other-mac:~/Local_Dev/projects/ByTheWeiCo/data/threads/posts.json data/threads/
   ```

3. **Re-symlink** if ByTheWeiCo exists on the new machine:
   ```bash
   rm data/threads/posts.json
   ln -s /path/to/ByTheWeiCo/data/threads/posts.json data/threads/posts.json
   ```

### `data/llm-tag-overrides.json` (504 KB)

Optional file for LLM-assisted tag corrections. Same three options apply:
```bash
# Copy from another machine:
scp other-mac:~/Local_Dev/projects/ByTheWeiCo/data/llm-tag-overrides.json data/

# Or re-symlink:
rm data/llm-tag-overrides.json
ln -s /path/to/ByTheWeiCo/data/llm-tag-overrides.json data/llm-tag-overrides.json
```

If this file is missing, the analysis pipeline runs fine without it -- it just skips LLM tag overrides.

---

## Hardcoded Paths

**Source scripts:** Clean. Zero hardcoded paths in `scripts/`, `src/`, `db/`, or config files. All paths use `__dirname` or `process.cwd()` relative resolution.

**Build artifacts:** The `dist/` directory (Astro build output) contains hardcoded absolute paths baked in at build time (e.g., `/Users/weixiangzhang/...` in `dist/server/entry.mjs` and chunk files). This is normal Astro behavior. **Fix:** Just rebuild:
```bash
npm run build
```
The `dist/` directory is untracked by git (listed in `git ls-files --others`) and should be added to `.gitignore`. It will be regenerated on the new machine.

---

## Docker Setup

The Docker stack is fully portable with no Mac-specific configuration:

- **`docker-compose.yml`** -- Postgres 17 Alpine + sync worker, all config via environment variables
- **`Dockerfile`** -- `node:22-alpine` base, copies only `scripts/` and `db/`, no platform-specific code
- **Port mapping** -- Postgres is exposed on `localhost:5433` (not the default 5432, to avoid conflicts with any local Postgres)
- **Volumes** -- `pgdata` named volume for persistence, `./data` and `./public/data` bind-mounted for sync output

```bash
docker compose up -d        # Start Postgres + sync worker
docker compose logs -f sync # Watch sync worker output
docker compose down          # Stop everything
docker compose down -v       # Stop + delete data volume (full reset)
```

The Postgres schema is auto-initialized from `db/init.sql` on first boot via Docker's `docker-entrypoint-initdb.d` mechanism.

---

## Apple Silicon Notes

**No native compilation required.** The `pg` package (v8.20.0) uses a pure JavaScript protocol implementation -- no `pg-native`, no C bindings, no `libpq` dependency. `npm install` will work identically on Intel and ARM Macs.

**`sharp`** is listed in the dependency tree (via Astro's image optimization). It ships prebuilt ARM64 binaries for macOS, so it installs without issue on Apple Silicon. If you hit problems, `npm rebuild sharp` usually fixes it.

**Docker** runs natively on Apple Silicon via Docker Desktop. The `postgres:17-alpine` and `node:22-alpine` images both have ARM64 variants that are pulled automatically.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  Docker Compose                                  │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │ postgres:17    │  │ sync worker            │  │
│  │ Port 5433      │←─│ node scripts/          │  │
│  │ db/init.sql    │  │ sync-worker.mjs        │  │
│  └────────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────┘
         ↑
         │ DATABASE_URL
         ↓
┌──────────────────────────────────────────────────┐
│  Astro SSR (npm run dev)                         │
│  localhost:4321                                   │
│  src/pages/ → explore, interactions              │
│  Reads: public/data/*.json + Postgres            │
└──────────────────────────────────────────────────┘
         ↑
         │ reads
         ↓
┌──────────────────────────────────────────────────┐
│  Analysis Pipeline (npm run analyze)             │
│  scripts/analysis/information-theory.mjs         │
│  scripts/analysis/knowledge-graph.mjs            │
│  Reads: data/threads/posts.json                  │
│  Writes: public/data/post-tags.json              │
│          public/data/knowledge-graph.json         │
└──────────────────────────────────────────────────┘
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `ENOENT: data/threads/posts.json` | Broken symlink. Copy the file or run a fresh sync. |
| `ECONNREFUSED` on port 5433 | Docker not running. `docker compose up -d` |
| `relation "posts" does not exist` | DB not initialized. `docker compose down -v && docker compose up -d` |
| Threads API 401 | Token expired (60-day lifetime). Refresh via the API. |
| `dist/` has wrong paths | Run `npm run build` to regenerate. |
| `sharp` install fails | `npm rebuild sharp` or delete `node_modules` and reinstall. |

---

## What You Can Skip

- **ByTheWeiCo project** -- Not needed if you copy `posts.json` directly or run a fresh sync
- **`data/llm-tag-overrides.json`** -- Optional; analysis works without it
- **`dist/` directory** -- Build artifact, regenerated by `npm run build`
- **Threads API credentials** -- Only needed if you want to sync new posts. The analysis pipeline works on static `posts.json` data alone
