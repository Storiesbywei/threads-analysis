# Threads Analysis

Analysis platform for 50K+ Threads posts by @maybe_foucault -- information theory, knowledge graphs, RAG search, haiku oracle, and iOS Shortcuts integration.

## Architecture

```
                          Threads API
                              |
                         sync-worker (30min)
                              |
                              v
  +-----------+    +---------------------+    +-------------------+
  | posts.json| -> | PostgreSQL 17       | <- | embed-posts.mjs   |
  | (raw API) |    | + pgvector          |    | (nomic-embed-text)|
  +-----------+    | 17 tables           |    +-------------------+
                   | 50K+ posts          |
                   +----+-------+--------+
                        |       |        |
              +---------+    +--+--+   +-+----------+
              v              v     v   v             v
        Node API       Flask API  Astro         Haiku Oracle
        :4322          :4323      :4321         (Gemma 4 -> iMessage)
        RAG search     Swagger    Dashboard
        Gemma 4        iOS Shortcuts
                       40+ endpoints
```

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env   # Fill in THREADS_ACCESS_TOKEN, THREADS_USER_ID, etc.

# 2. Start Postgres (always needed)
docker compose up -d

# 3. Seed the database
npm run db:seed        # From posts.json
npm run seed:json      # Or from static JSON files

# 4. Start APIs
npm run api            # Node API on :4322
# Flask API runs via Docker:
docker compose --profile api up -d   # Flask on :4323

# 5. Or start everything at once
bash scripts/start.sh  # Postgres + Ollama + API
# Or via Docker:
docker compose --profile full up -d
```

## Docker Services

| Service    | Image                    | Port | Description                      |
|------------|--------------------------|------|----------------------------------|
| postgres   | pgvector/pgvector:pg17   | 5433 | Postgres + pgvector              |
| sync       | Node 22 Alpine           | --   | Auto-sync every 30 min           |
| web        | Astro                    | 4321 | Dashboard                        |
| api        | Node 22 Alpine           | 4322 | REST API, RAG search, Gemma 4    |
| flask-api  | Python 3.12-slim         | 4323 | iOS Shortcuts, Swagger UI        |

Profiles: `data` (postgres+sync), `web`, `api`, `full` (everything).

## API Endpoints

Flask API on `:4323` -- Swagger UI at `/docs`, llms.txt at `/llms.txt`.

### Time-Based
| Endpoint                         | Description              |
|----------------------------------|--------------------------|
| `GET /posts/now`                 | Last 30 minutes          |
| `GET /posts/hour`                | Last hour                |
| `GET /posts/today`               | Today's posts            |
| `GET /posts/week`                | This week                |
| `GET /posts/month`               | This month               |
| `GET /posts/since?minutes=N`     | Last N minutes           |
| `GET /posts/between?from=&to=`   | Date range               |
| `GET /posts/latest?n=10`         | Last N posts             |

### Search and Discovery
| Endpoint                         | Description              |
|----------------------------------|--------------------------|
| `GET /posts/search?q=term`       | Full-text search         |
| `GET /posts/tag/{tag}`           | Posts by tag             |
| `GET /posts/tag/{tag}/latest?n=` | Latest N in tag          |
| `GET /posts/random`              | Random post              |
| `GET /posts/random/{tag}`        | Random from tag          |
| `GET /posts/{id}`                | Single post by ID        |

### Analytics
| Endpoint                         | Description              |
|----------------------------------|--------------------------|
| `GET /stats/overview`            | Totals, date range       |
| `GET /stats/streak`              | Consecutive posting days |
| `GET /stats/top?by=views&n=10`   | Top posts by metric      |
| `GET /stats/top/today`           | Most engaged today       |
| `GET /stats/hourly`              | Posts per hour today     |
| `GET /stats/daily`               | Posts per day this week  |
| `GET /stats/tags`                | All tags with counts     |
| `GET /stats/velocity`            | Posting rate averages    |

### Social
| Endpoint                         | Description              |
|----------------------------------|--------------------------|
| `GET /social/mentions`           | Top mentioned users      |
| `GET /social/interactions`       | Interaction summary      |
| `GET /social/conversations/{id}` | Reply thread             |

### Knowledge Graph and Digests
| Endpoint                         | Description              |
|----------------------------------|--------------------------|
| `GET /graph/topics`              | Tag clusters             |
| `GET /graph/related/{tag}`       | Related tags             |
| `GET /digest/today`              | Structured day summary   |
| `GET /digest/week`               | Weekly summary           |
| `GET /digest/brief`              | Natural language 24h     |

## iOS Shortcuts

The Flask API (`:4323`) is designed for iOS Shortcuts via "Get Contents of URL" actions. See `docs/ios-shortcuts-guide.md` for 7 ready-to-use recipes:

- "What did I post today?" -- `/posts/today`
- "Random post" -- `/posts/random`
- "Search my posts" -- `/posts/search?q=`
- "Daily digest" -- `/digest/brief`
- "Top posts" -- `/stats/top?by=views&n=5`
- "Who I talk to" -- `/social/mentions`
- "Stats overview" -- `/stats/overview`

All endpoints return JSON. No authentication required (Tailscale network only).

## Haiku Oracle

Picks random posts from different time periods, feeds them to Gemma 4 via Ollama, generates a haiku distillation, saves it to the `haikus` table with graph edges to source posts, then sends it via iMessage.

```bash
npm run haiku         # Generate one haiku
npm run haiku:loop    # Run 2-4 random times per day
```

## Data Pipeline

```
Threads API -> sync-worker -> posts.json -> Postgres
                                              |
                    +-------------------------+-------------------------+
                    |                         |                         |
           information-theory.mjs      embed-posts.mjs          enrich-posts.mjs
           (entropy, tags, surprise)   (nomic-embed-text 768d)  (sentiment, energy, intent)
                    |                         |                         |
                    v                         v                         v
           post-tags.json             posts.embedding            enrichment columns
           knowledge-graph.json       (pgvector)                 (no LLM needed)
```

20 tags: philosophy, tech, personal, reaction, one-liner, question, media, commentary, finance, meta-social, daily-life, work, food, url-share, sex-gender, race, language, political, creative, shitpost.

## Tech Stack

- **Runtime**: Node.js 22 (ESM), Python 3.12
- **Database**: PostgreSQL 17 + pgvector
- **Embeddings**: Ollama + nomic-embed-text (768d)
- **LLM**: Gemma 4 via Ollama (RAG search, haiku generation)
- **Web**: Astro + React + Three.js (force-directed graphs)
- **APIs**: Express (Node, :4322), Flask + flask-openapi3 (Python, :4323)
- **Infra**: Docker Compose, Tailscale
- **Testing**: Vitest

## Corpus Stats

| Metric         | Value                                  |
|----------------|----------------------------------------|
| Total posts    | 50,706                                 |
| Original       | 12,096                                 |
| Replies        | 30,707                                 |
| Quotes         | 7,901                                  |
| With text      | 41,943                                 |
| Tags assigned  | 54,689 across 20 categories            |
| Interactions   | 1,746 across 422 users                 |
| KG nodes       | 1,896                                  |
| KG edges       | 12,039                                 |
| Embeddings     | In progress (nomic-embed-text 768d)    |

## Configuration

Copy `.env.example` and fill in your values. See `CLAUDE.md` for the full environment variable reference. Never commit `.env` -- it contains API tokens.
