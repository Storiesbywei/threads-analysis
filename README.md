# Threads Analysis

Self-hosted analysis platform for your Threads account. Pulls your posts via the Threads API, runs information theory, HDBSCAN clustering, knowledge graphs, sentiment analysis, and serves everything through Grafana dashboards and REST APIs.

Bring your own Threads API credentials — the platform analyzes whatever account you connect.

## Architecture

```
                          Threads API
                              |
                         sync-worker (30min)
                              |
                              v
  +-----------+    +---------------------+    +-------------------+
  | posts.json| -> | PostgreSQL 17       | <- | embed-posts.mjs   |
  | (raw API) |    | + pgvector          |    | (multi-model)     |
  +-----------+    | 17+ tables          |    +-------------------+
                   +----+-------+--------+
                        |       |        |
              +---------+    +--+--+   +-+----------+
              v              v     v   v             v
        Node API       Flask API  Grafana      Palace Graph
        :4322          :4323      :3002        (Gemma 4 navigator)
        RAG search     Swagger    8 dashboards
        Gemma 4        iOS Shortcuts
```

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Storiesbywei/threads-analysis.git
cd threads-analysis
npm install

# 2. Set up your credentials
cp .env.example .env
# Edit .env — add your THREADS_ACCESS_TOKEN and THREADS_USER_ID
# See docs/getting-started.md for how to get these

# 3. Start everything
docker compose --profile full up -d

# 4. Pull your data
npm run sync              # Pull posts from your Threads account
npm run db:seed           # Seed Postgres
npm run enrich            # Compute sentiment, energy, intent
npm run sync:metrics      # Backfill engagement metrics
```

Open **http://localhost:3002** for Grafana dashboards.

See **[docs/getting-started.md](docs/getting-started.md)** for the full setup guide including Threads API credentials.

## Docker Services

| Service    | Image                    | Port | Description                      |
|------------|--------------------------|------|----------------------------------|
| postgres   | pgvector/pgvector:pg17   | 5433 | Postgres + pgvector              |
| sync       | Node 22 Alpine           | --   | Auto-sync every 30 min           |
| api        | Node 22 Alpine           | 4322 | REST API, RAG search, Gemma 4    |
| flask-api  | Python 3.12-slim         | 4323 | iOS Shortcuts, Swagger UI        |
| grafana    | Grafana OSS              | 3002 | 8 dashboards, auto-provisioned   |

Profiles: `data` (postgres+sync), `api`, `full` (everything).

## Grafana Dashboards

8 dashboards auto-provision on startup — no manual config needed:

| Dashboard               | Panels | Description                                    |
|-------------------------|--------|------------------------------------------------|
| Threads Analysis        | 25     | Main overview — post volume, types, tags       |
| Personal Analytics      | 20     | Sentiment, energy, timing, posting patterns    |
| Content Performance     | 17     | Engagement metrics, viral analysis             |
| Community               | 11     | Social interactions, top repliers              |
| Relationship Explorer   | 11     | Drill into any person's interactions           |
| Cluster Landscape       | 15     | HDBSCAN topic clusters, emotional landscape    |
| Embedding Model Arena   | 14     | Compare how different models cluster your data |
| Thread Palace           | 15     | Navigate the knowledge graph hierarchy         |

## API Endpoints

### Node API (`:4322`)

| Category | Endpoints |
|----------|-----------|
| Posts | `GET /api/posts`, `/api/posts/search?q=`, `/api/posts/recent`, `/api/posts/random`, `/api/posts/stats` |
| Metrics | `GET /api/metrics/top`, `/api/metrics/summary`, `/api/metrics/daily` |
| Tags | `GET /api/tags`, `/api/tags/cloud`, `/api/tags/:tag` |
| Graph | `GET /api/graph/nodes`, `/api/graph/edges`, `/api/graph/neighbors/:id` |
| Clusters | `GET /api/clusters`, `/api/clusters/:id/posts`, `/api/clusters/overlap` |
| Palace | `GET /api/palace/topology`, `/api/palace/wings/:id`, `/api/palace/rooms/:id` |
| Models | `GET /api/models` |
| AI | `POST /api/ask` (RAG via Ollama) |

Full spec: `http://localhost:4322/api/openapi.json`

### Flask API (`:4323`)

| Category | Endpoints |
|----------|-----------|
| Time-based | `/posts/now`, `/posts/today`, `/posts/week`, `/posts/since?minutes=N` |
| Search | `/posts/search?q=`, `/posts/tag/{tag}`, `/posts/random` |
| Analytics | `/stats/overview`, `/stats/streak`, `/stats/top`, `/stats/velocity` |
| Social | `/social/mentions`, `/social/interactions`, `/social/conversations/{id}` |
| Clusters | `/clusters`, `/clusters/summary`, `/palace/navigate?q=`, `/palace/edges` |
| Digests | `/digest/today`, `/digest/week`, `/digest/brief` |
| Models | `/models` |

Swagger UI: `http://localhost:4323/docs`

## Optional Features

These require [Ollama](https://ollama.com/) running locally:

### Embeddings & Clustering

```bash
ollama pull all-minilm
npm run embed                                    # Embed posts (384d vectors)
node scripts/embed-multimodel.mjs --model=all    # 9 embedding models
python3 scripts/cluster-explorer.py              # HDBSCAN clustering
python3 scripts/palace/sync_clusters.py          # Build palace graph
python3 scripts/palace/rename_clusters.py        # Gemma 4 names clusters
```

### Palace Graph Navigator

The palace graph is a hierarchical index over your HDBSCAN clusters, adapted from the [babel-palace](https://github.com/Storiesbywei/babel-palace) architecture. Gemma 4 routes through the hierarchy locally (~1,125 tokens per traversal, invisible to the caller).

```bash
ollama pull gemma4:e4b
python3 scripts/palace/navigate.py --interactive
python3 scripts/palace/navigate.py "what do I post about late at night"
```

### Haiku Oracle

Picks random posts, feeds them to Gemma 4, generates a haiku, sends it via iMessage.

```bash
npm run haiku         # Generate one haiku
npm run haiku:loop    # Run 2-4 random times per day
```

## Data Pipeline

```
Threads API -> sync-worker -> Postgres
                                 |
               +-----------------+-----------------+
               |                 |                 |
        enrich-posts.mjs   embed-posts.mjs   cluster-explorer.py
        (sentiment,        (9 embedding      (HDBSCAN + UMAP
         energy, intent)    models)           + Gemma 4 naming)
               |                 |                 |
               v                 v                 v
        enrichment cols    pgvector cols     embedding_clusters
                                            post_clusters
                                            tp_nodes / tp_edges
```

## iOS Shortcuts

The Flask API is designed for iOS Shortcuts via "Get Contents of URL":

- "What did I post today?" — `/posts/today`
- "Random post" — `/posts/random`
- "Search my posts" — `/posts/search?q=`
- "Daily digest" — `/digest/brief`
- "Cluster summary" — `/clusters/summary`

All endpoints return JSON. No authentication required (designed for local/Tailscale network).

## Tech Stack

- **Runtime**: Node.js 22 (ESM), Python 3.12
- **Database**: PostgreSQL 17 + pgvector
- **Embeddings**: Ollama (9 models: all-minilm, nomic, bge-m3, mxbai, snowflake, granite, qwen3, arctic2, nomic-v2-moe)
- **LLM**: Gemma 4 via Ollama (cluster naming, RAG, haiku)
- **Clustering**: HDBSCAN + UMAP dimensionality reduction
- **Dashboards**: Grafana OSS (auto-provisioned)
- **APIs**: Node HTTP (`:4322`), Flask + flask-openapi3 (`:4323`)
- **Infra**: Docker Compose, Tailscale
- **Testing**: Vitest, pipeline-audit.mjs (57 tests)

## Configuration

Create a `.env` file with your credentials. See [docs/getting-started.md](docs/getting-started.md) for full setup instructions. Never commit `.env` — it contains API tokens.
