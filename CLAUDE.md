# Threads Analysis — @maybe_foucault

## Overview
Standalone analysis platform for ~46K Threads posts from @maybe_foucault. Extracted from ByTheWeiCo's archival visualization into its own project for deeper, independent analysis work.

## Project Config
```yaml
name: threads-analysis
stack: Node.js (ESM), PostgreSQL 17, Docker, Vitest
phase: Active — Docker auto-sync running, Postgres seeded, analysis pipeline ready
account: @maybe_foucault (Threads user ID: 25703740162660740)
origin: Forked analysis scripts from ByTheWeiCo (Feb 2026)
```

## Architecture
```
scripts/
  sync-worker.mjs                   # Docker entrypoint — auto-sync on interval (default 30min)
  db.mjs                            # Postgres pool + upsert helpers (lazy init)
  db-seed.mjs                       # Backfill posts.json → Postgres (46K posts in ~10s)
  threads-sync.mjs                  # Standalone Threads API sync → data/threads/posts.json
  threads-backfill-metrics.mjs      # Batch engagement metrics for older posts
  threads-backfill-replies.mjs      # One-time reply history backfill
  adapters/
    threads-adapter.mjs             # Raw API → unified event schema (filters REPOST_FACADE)
  analysis/
    info-theory-lib.mjs             # Pure functions: entropy, surprise, pmi, npmi, tokenize
    information-theory.mjs           # Shannon analysis → public/data/post-tags.json
    sub-classifiers.mjs             # 9 parents → 35 sub-tags (keyword regex)
    knowledge-graph.mjs             # PMI co-occurrence + TF-IDF → public/data/knowledge-graph.json
  __tests__/                        # Vitest tests
db/
  init.sql                          # Full Postgres schema (13 tables, enums, materialized view, GIN index)
data/
  threads/posts.json                # Raw posts (symlinked to ByTheWeiCo's copy, 23MB, ~46K posts)
public/data/
  post-tags.json                    # 37,912 classified posts (20 tags, 35 sub-tags, surprise scores)
  knowledge-graph.json              # 1,638 nodes, 11,155 edges
docs/
  threads-api-reference.md          # OAuth, endpoints, rate limits
  threads-chronology.md             # 7-section Foucauldian analysis page spec
  threads-taxonomy.md               # Treemap + sub-tag audit
  threads-network.md                # Force-directed graph + visionOS WebXR
  threads-discourse.md              # 9-category deep-dive + Foucault Index
docker-compose.yml                  # Postgres 17 + sync worker
Dockerfile                          # Node 22 Alpine for sync worker
```

## Docker Infrastructure
```yaml
services:
  postgres: Postgres 17 Alpine on port 5433, schema auto-applied from db/init.sql
  sync: Node 22 Alpine worker, auto-syncs every SYNC_INTERVAL_MINUTES (default 30)
volumes:
  pgdata: Persisted Postgres data
  ./data + ./public/data: Mounted into sync container
```

## Postgres Schema (13 tables)
```
users              # Tracked accounts
posts              # Every post/reply/quote/repost (45,938 rows, GIN text search)
carousel_items     # Media items within CAROUSEL_ALBUM posts
metrics            # Time-series engagement snapshots (views, likes, replies, reposts, quotes, shares)
metrics_latest     # Materialized view — most recent metrics per post
tags               # 20-tag taxonomy per post (multi-label + primary flag)
sub_tags           # 35 colon-namespaced sub-tags
surprise_scores    # Per-post information-theoretic analysis
kg_nodes           # Knowledge graph nodes (tag, concept, bridge)
kg_edges           # Knowledge graph edges (co-occurrence, temporal, hierarchy)
conversations      # Reply trees from /conversation endpoint
sync_log           # Every sync run with stats + error details
tokens             # OAuth token lifecycle (hashed, never raw)
corpus_snapshots   # Periodic corpus-level analysis snapshots
```

## Key Commands
```bash
# Docker
docker compose up -d         # Start Postgres + sync worker
docker compose down          # Stop everything
docker compose logs -f sync  # Watch sync worker output

# Manual sync (writes to posts.json)
npm run sync                 # Sync posts from Threads API (incremental)
npm run sync:replies         # Backfill full reply history
npm run sync:metrics         # Backfill engagement metrics

# Database
npm run db:seed              # Backfill posts.json → Postgres (~10s for 46K posts)
npm run worker               # Run sync worker locally (outside Docker)

# Analysis
npm run analyze              # Run information-theory + knowledge-graph analysis
npm run full                 # sync + analyze

# Testing
npm test                     # Vitest
npm run test:watch           # Vitest watch mode
```

## Corpus Stats
- **Posts**: 45,938 total in Postgres (5,548 original, 28,098 replies, 6,136 quotes, 6,156 reposts)
- **Text posts**: ~37,912 with text (excludes REPOST_FACADE + empty)
- **Taxonomy**: 20 primary tags, 35 sub-tags (colon-namespaced: parent:child)
- **Engagement**: views, likes, replies, reposts, quotes (from April 2024 onward)
- **Date range**: July 29, 2024 → Feb 22, 2026

## Analysis Pipeline
```
data/threads/posts.json (raw API data)
  ↓ information-theory.mjs
  │   → character, word, bigram entropy
  │   → Zipf exponent, Heaps' law
  │   → 20-tag heuristic classification (regex, priority-ordered)
  │   → LLM tag overrides (data/llm-tag-overrides.json, optional)
  │   → sub-classifiers.mjs (35 sub-tags via keyword regex)
  │   → per-post surprise scores (self-information in bits)
  │   → mutual information: tag×quote, tag×hour, tag×length, tag×day
  │   → topic transition entropy, burst analysis
  ↓ public/data/post-tags.json
  ↓ knowledge-graph.mjs
  │   → PMI-weighted co-occurrence edges (tags + sub-tags)
  │   → temporal proximity edges (5-post sliding window)
  │   → TF-IDF concept nodes (top 10 per category)
  │   → bridge concepts (words spanning 3+ categories)
  │   → hierarchy edges (parent → sub-tag)
  ↓ public/data/knowledge-graph.json
```

## Threads API Reference
- Base URL: `https://graph.threads.net/v1.0/`
- Auth: OAuth 2.0 long-lived token (60-day, refreshable)
- Endpoints: `/{user-id}/threads`, `/{user-id}/replies`, `/{media-id}/insights`
- Rate limits: 250 posts/24h publish, 1000 replies/24h, undocumented GET limits
- Metrics available from April 13, 2024 onward only
- Token in `.env` as `THREADS_ACCESS_TOKEN`

## Environment Variables (.env)
```
THREADS_ACCESS_TOKEN     # Threads API OAuth token
THREADS_USER_ID          # 25703740162660740
THREADS_APP_ID           # App ID
APP_SECRETS              # App secret
THREADS_USER_SECRETS     # User secret
POSTGRES_PASSWORD        # Default: threads_local_dev
POSTGRES_USER            # Default: threads
POSTGRES_DB              # Default: threads
POSTGRES_HOST            # localhost (host) or postgres (Docker)
POSTGRES_PORT            # 5433 (mapped from 5432)
DATABASE_URL             # postgres://threads:threads_local_dev@localhost:5433/threads
SYNC_INTERVAL_MINUTES    # Default: 30
METRICS_BATCH_SIZE       # Default: 200
FULL_SYNC_ON_START       # Default: false
```

## Conventions
- ESM modules throughout (`"type": "module"`)
- Unified event schema: `event_id, ts, ts_iso, source, type, context, health, payload`
- Tags: 20-tag taxonomy, multi-label (tags[]) + single primary_tag
- Sub-tags: colon-namespaced (e.g., `philosophy:continental`, `tech:ai_ml`)
- Surprise: average self-information per word in bits (higher = more surprising)
- .env is gitignored — never commit API tokens
- db.mjs uses lazy pool init so importers can set DATABASE_URL before first query
