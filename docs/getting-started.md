# Getting Started — Threads Analysis

A guide to running your own instance of the Threads Analysis platform.

## Prerequisites

- **Docker Desktop** (Mac/Windows/Linux) — [download](https://www.docker.com/products/docker-desktop/)
- **Node.js 22+** — `brew install node` or [nodejs.org](https://nodejs.org/)
- **A Threads account** with a Meta developer app for API access
- **Ollama** (optional, for embeddings/AI features) — [ollama.com](https://ollama.com/)

## 1. Clone the repo

```bash
git clone https://github.com/Storiesbywei/threads-analysis.git
cd threads-analysis
npm install
```

## 2. Set up your Threads API credentials

You need a Meta Developer App with Threads API access. Follow Meta's guide:
https://developers.facebook.com/docs/threads/getting-started

Once you have your credentials, create a `.env` file in the project root:

```bash
cp .env.example .env   # if available, or create from scratch
```

Then fill in:

```env
# Required — your Threads API credentials
THREADS_ACCESS_TOKEN=your_long_lived_token_here
THREADS_USER_ID=your_numeric_user_id
THREADS_APP_ID=your_app_id
APP_SECRETS=your_app_secret

# Postgres (defaults work with Docker)
POSTGRES_USER=threads
POSTGRES_PASSWORD=threads_local_dev
POSTGRES_DB=threads
POSTGRES_PORT=5433
DATABASE_URL=postgres://threads:threads_local_dev@localhost:5433/threads

# Ollama (optional — needed for embeddings and AI features)
OLLAMA_URL=http://localhost:11434
```

### How to get your Threads token

1. Go to [developers.facebook.com](https://developers.facebook.com/) and create an app
2. Add the **Threads API** product to your app
3. In the Threads API settings, generate a **short-lived token**
4. Exchange it for a **long-lived token** (60 days, auto-refreshable):
   ```bash
   curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=YOUR_APP_SECRET&access_token=YOUR_SHORT_LIVED_TOKEN"
   ```
5. Your **user ID** is returned when you call:
   ```bash
   curl -s "https://graph.threads.net/v1.0/me?access_token=YOUR_TOKEN"
   ```

## 3. Start the stack

```bash
# Start Postgres + all services
docker compose --profile full up -d
```

This starts:
- **Postgres** on `:5433` (with pgvector extension)
- **Sync worker** — auto-pulls your posts every 30 min
- **Node API** on `:4322` — REST API + RAG search
- **Flask API** on `:4323` — iOS Shortcuts + Swagger UI
- **Grafana** on `:3002` — 8 dashboards, auto-provisioned

## 4. Initial data pull

```bash
# Pull all your posts from Threads API
npm run sync

# Seed Postgres from the downloaded JSON
npm run db:seed

# Compute sentiment, energy, intent (no AI needed)
npm run enrich

# Backfill engagement metrics (views, likes, etc.)
npm run sync:metrics
```

## 5. Optional — Embeddings & AI features

If you have [Ollama](https://ollama.com/) installed:

```bash
# Pull the embedding model
ollama pull all-minilm

# Embed all posts (creates vector search)
npm run embed

# For multi-model embeddings (9 models)
node scripts/embed-multimodel.mjs --model=all --batch-size=50

# For HDBSCAN clustering + palace graph
pip3 install umap-learn hdbscan psycopg2-binary numpy
python3 scripts/cluster-explorer.py
python3 scripts/palace/sync_clusters.py
python3 scripts/palace/rename_clusters.py
```

For the AI navigator:
```bash
ollama pull qwen3.5
python3 scripts/palace/navigate.py --interactive
```

## 6. Access the dashboards

Open Grafana at **http://localhost:3002** (no login required by default).

8 dashboards available:
- **Threads Analysis** — main overview (25 panels)
- **Personal Analytics** — sentiment, energy, timing patterns
- **Content Performance** — engagement metrics, viral analysis
- **Community** — social interactions, top repliers
- **Relationship Explorer** — drill into any person's interactions
- **Cluster Landscape** — HDBSCAN topic clusters
- **Embedding Model Arena** — compare embedding models
- **Thread Palace** — navigate the knowledge graph

## 7. APIs

### Node API (`:4322`)
```
GET /api/posts              # List posts with pagination
GET /api/posts/search?q=    # Full-text search
GET /api/clusters           # HDBSCAN clusters
GET /api/palace/topology    # Palace graph wings
GET /api/models             # Available embedding models
GET /api/ask?q=             # RAG-powered Q&A (needs Ollama)
```

Full spec: `http://localhost:4322/api/openapi.json`

### Flask API (`:4323`)
```
GET /posts/recent           # Recent posts
GET /clusters/summary       # Cluster overview (iOS Shortcut friendly)
GET /palace/navigate?q=     # Semantic search through palace
GET /models                 # Embedding model stats
```

Swagger UI: `http://localhost:4323/docs`

## Updating your data

The sync worker auto-pulls every 30 minutes when running. To manually sync:

```bash
npm run sync              # Pull new posts
npm run sync:metrics      # Update engagement metrics
npm run enrich            # Re-compute sentiment/energy/intent
```

## Troubleshooting

- **"relation posts does not exist"** — Run `docker compose up -d` first, then `npm run db:seed`
- **Grafana shows "No data"** — Check that Postgres has data: `docker exec threads-analysis-postgres-1 psql -U threads -d threads -c "SELECT COUNT(*) FROM posts"`
- **Token expired** — Refresh your long-lived token (they last 60 days):
  ```bash
  curl "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=YOUR_CURRENT_TOKEN"
  ```
- **Ollama not connecting** — Make sure Ollama is running: `ollama serve`
