# Threads Analysis — @maybe_foucault

## Overview
Standalone analysis platform for ~50K Threads posts from @maybe_foucault. Information theory, knowledge graphs, discourse taxonomy, RAG search, haiku oracle, iOS Shortcuts API.

## Project Config
```yaml
name: threads-analysis
stack: Node.js (ESM), Python (Flask), PostgreSQL 17 + pgvector, Ollama, Docker, Vitest
phase: Active — Docker auto-sync running, dual APIs live, embeddings in progress
account: @maybe_foucault (Threads user ID: 25703740162660740)
origin: Forked analysis scripts from ByTheWeiCo (Feb 2026)
```

## Architecture
```
scripts/
  sync-worker.mjs                   # Docker entrypoint — auto-sync on interval (default 30min)
  db.mjs                            # Postgres pool + upsert helpers (lazy init)
  db-seed.mjs                       # Backfill posts.json → Postgres
  seed-from-json.mjs                # Seed Postgres from static JSON files
  threads-sync.mjs                  # Standalone Threads API sync → data/threads/posts.json
  threads-backfill-metrics.mjs      # Batch engagement metrics for older posts
  threads-backfill-replies.mjs      # One-time reply history backfill
  api-server.mjs                    # Node REST API on :4322 (26 endpoints, Gemma 4 RAG)
  embed-posts.mjs                   # Batch embed posts via Ollama nomic-embed-text → pgvector
  enrich-posts.mjs                  # Compute sentiment, energy, intent, language (no LLM)
  add-vector-column.mjs             # Migration: pgvector extension + embedding column
  add-enrichment-columns.mjs        # Migration: sentiment, energy, vibe, intent columns
  haiku-agent.mjs                   # Haiku oracle: random posts → Gemma 4 → haiku → iMessage
  monitor-embeddings.sh             # 15-min health monitor, iMessage alerts on failure
  start.sh                          # One-command startup (Postgres + Ollama + API)
  extract-mentions.mjs              # Parse @mentions → interactions table
  https-proxy.mjs                   # HTTPS proxy for local dev
  keyword-search.mjs                # CLI keyword search utility
  adapters/
    threads-adapter.mjs             # Raw API → unified event schema (filters REPOST_FACADE)
  analysis/
    info-theory-lib.mjs             # Pure functions: entropy, surprise, pmi, npmi, tokenize
    information-theory.mjs           # Shannon analysis → public/data/post-tags.json
    sub-classifiers.mjs             # 9 parents → 35 sub-tags (keyword regex)
    knowledge-graph.mjs             # PMI co-occurrence + TF-IDF → public/data/knowledge-graph.json
  __tests__/                        # Vitest tests
api/
  app.py                            # Flask API on :4323 (40+ endpoints, Swagger UI, llms.txt)
  Dockerfile                        # Python 3.12-slim + gunicorn
  requirements.txt                  # flask-openapi3, psycopg2-binary, gunicorn, flask-cors
  llms.txt                          # Full LLM instruction file for API discovery
  llms-mini.txt                     # Compact quick reference
db/
  init.sql                          # Full Postgres schema (17 tables, enums, materialized view, GIN index)
data/
  threads/posts.json                # Raw posts (23MB+)
public/data/
  post-tags.json                    # Classified posts (20 tags, 35 sub-tags, surprise scores)
  knowledge-graph.json              # Knowledge graph (nodes + edges)
docs/
  ios-shortcuts-guide.md            # 7 iOS Shortcut recipes
  visionos-native-app-design.md     # 7 visualization concepts for Vision Pro
  grafana-dashboard.json            # Grafana dashboard export (14 panels)
  threads-api-reference.md          # OAuth, endpoints, rate limits
  threads-chronology.md             # 7-section Foucauldian analysis page spec
  threads-taxonomy.md               # Treemap + sub-tag audit
  threads-network.md                # Force-directed graph + visionOS WebXR
  threads-discourse.md              # 9-category deep-dive + Foucault Index
docker-compose.yml                  # 5 services (postgres, sync, web, api, flask-api)
Dockerfile                          # Node 22 Alpine for sync worker + API
Dockerfile.web                      # Astro dashboard
```

## Docker Infrastructure
```yaml
services:
  postgres: pgvector/pgvector:pg17 on :5433 (pgvector enabled)
  sync: Node 22 worker, auto-pulls every 30 min (profile: data, full)
  web: Astro dashboard on :4321 (profile: web, full)
  api: Node REST API on :4322 — RAG + Gemma 4 (profile: api, full)
  flask-api: Flask API on :4323 — iOS Shortcuts + Swagger UI (profile: api, full)
volumes:
  pgdata: Persisted Postgres data
  ./data + ./public/data: Mounted into sync container
```

## Postgres Schema (17 tables)
```
users              # Tracked accounts
posts              # Every post/reply/quote/repost (50,706 rows, GIN text search)
  .embedding       # vector(768) — pgvector column (nomic-embed-text)
  .sentiment       # Computed: sentiment score
  .energy          # Computed: energy level
  .intent          # Computed: post intent
  .language        # Computed: language
  .vibe            # Computed: vibe classification
  .audience        # Computed: target audience
  .abstraction_level  # Computed: abstraction level
  .hour_bucket     # Computed: hour bucket
  .is_weekend      # Computed: weekend flag
carousel_items     # Media items within CAROUSEL_ALBUM posts
metrics            # Time-series engagement snapshots
metrics_latest     # Materialized view — most recent metrics per post
tags               # 20-tag taxonomy per post (multi-label + primary flag)
sub_tags           # 35 colon-namespaced sub-tags
surprise_scores    # Per-post information-theoretic analysis
kg_nodes           # Knowledge graph nodes (tag, concept, bridge)
kg_edges           # Knowledge graph edges (co-occurrence, temporal, hierarchy)
conversations      # Reply trees from /conversation endpoint
interactions       # @mention graph (1,746 rows, 422 users)
haikus             # Haiku oracle outputs (UUID primary key)
haiku_edges        # Graph: haiku → source posts
sync_log           # Every sync run with stats + error details
tokens             # OAuth token lifecycle (hashed, never raw)
corpus_snapshots   # Periodic corpus-level analysis snapshots
```

## Key Commands
```bash
# Docker
docker compose up -d              # Start Postgres (always)
docker compose --profile full up -d  # Start everything
docker compose --profile full down   # Stop everything

# Sync
npm run sync          # Pull from Threads API (incremental)
npm run sync:replies  # Backfill full reply history
npm run sync:metrics  # Backfill engagement metrics

# Database
npm run db:seed       # Backfill posts.json → Postgres
npm run seed:json     # Seed from static JSON files

# Embeddings & Enrichment
npm run embed         # Embed all posts via Ollama nomic-embed-text
npm run enrich        # Compute sentiment, energy, intent (no LLM)

# Analysis
npm run analyze       # Information theory + knowledge graph
npm run full          # sync + analyze

# APIs
npm run api           # Start Node API on :4322
bash scripts/start.sh # Start everything (Postgres + Ollama + API)

# Haiku Oracle
npm run haiku         # Generate one haiku
npm run haiku:loop    # Run haiku oracle (2-4 random times/day)

# Testing
npm test              # Vitest
npm run test:watch    # Vitest watch mode
```

## Corpus Stats
- **Posts**: 50,706 total (12,096 original, 30,707 replies, 7,901 quotes)
- **With text**: 41,943
- **Tags**: 54,689 across 20 categories
- **Interactions**: 1,746 across 422 users
- **Knowledge graph**: 1,896 nodes, 12,039 edges
- **Embeddings**: in progress (nomic-embed-text 768d via pgvector)

## Analysis Pipeline
```
data/threads/posts.json (raw API data)
  | information-theory.mjs
  |   → character, word, bigram entropy
  |   → Zipf exponent, Heaps' law
  |   → 20-tag heuristic classification (regex, priority-ordered)
  |   → LLM tag overrides (data/llm-tag-overrides.json, optional)
  |   → sub-classifiers.mjs (35 sub-tags via keyword regex)
  |   → per-post surprise scores (self-information in bits)
  |   → mutual information: tag*quote, tag*hour, tag*length, tag*day
  |   → topic transition entropy, burst analysis
  v public/data/post-tags.json
  | knowledge-graph.mjs
  |   → PMI-weighted co-occurrence edges (tags + sub-tags)
  |   → temporal proximity edges (5-post sliding window)
  |   → TF-IDF concept nodes (top 10 per category)
  |   → bridge concepts (words spanning 3+ categories)
  |   → hierarchy edges (parent → sub-tag)
  v public/data/knowledge-graph.json
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
THREADS_USER_ID          # Threads user ID
THREADS_APP_ID           # App ID
APP_SECRETS              # App secret
THREADS_USER_SECRETS     # User secret
POSTGRES_PASSWORD        # Default: threads_local_dev
POSTGRES_USER            # Default: threads
POSTGRES_DB              # Default: threads
POSTGRES_HOST            # localhost (host) or postgres (Docker)
POSTGRES_PORT            # 5433 (mapped from 5432)
DATABASE_URL             # postgres://threads:<password>@localhost:5433/threads
SYNC_INTERVAL_MINUTES    # Default: 30
METRICS_BATCH_SIZE       # Default: 200
FULL_SYNC_ON_START       # Default: false
OLLAMA_URL               # Default: http://localhost:11434 (or host.docker.internal in Docker)
```

## Local Models
```yaml
# Ollama chat models (localhost:11434)
qwen3.5: 6.6GB (primary, replaces qwen3:14b)
llama3.2:3b: 2.0GB (lightweight fallback)

# MLX models (in ~/.cache/huggingface/hub/)
gemma-4-e4b: mlx-community/gemma-4-e4b-it-4bit (4.3GB, 50 tok/s)
gemma-4-26b: unsloth/gemma-4-26b-a4b-it-UD-MLX-4bit (15.6GB)
gemma-3-4b: mlx-community/gemma-3-4b-it-4bit

# Ollama embedding models (do NOT change)
nomic-embed-text-v2-moe: 957MB (primary)
all-minilm: 45MB (clustering)
```

## Conventions
- ESM modules throughout (`"type": "module"`)
- Unified event schema: `event_id, ts, ts_iso, source, type, context, health, payload`
- Tags: 20-tag taxonomy, multi-label (tags[]) + single primary_tag
- Sub-tags: colon-namespaced (e.g., `philosophy:continental`, `tech:ai_ml`)
- Surprise: average self-information per word in bits (higher = more surprising)
- .env is gitignored — never commit API tokens
- db.mjs uses lazy pool init so importers can set DATABASE_URL before first query
- Dev servers bind to 0.0.0.0 (Tailscale accessible)
- Node API (:4322) for RAG/semantic search; Flask API (:4323) for iOS Shortcuts + Swagger
