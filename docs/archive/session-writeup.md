# Building a 46K-Post Analysis Platform in One Claude Code Session

A developer wanted to turn their personal Threads posting history into something they could actually study. Not a vanity dashboard -- a real analytical instrument: a Postgres-backed pipeline that classifies every post by topic, measures its information-theoretic surprise, maps co-occurrence patterns into a knowledge graph, and serves the whole thing through an Astro dashboard with live sync. They built it in a single Claude Code session using parallel agents, automated code review, and blind validation. Here is what happened.

## The Starting Point

The raw material was a 23MB JSON file containing roughly 46,000 posts from the Threads account @maybe_foucault -- a corpus spanning the full history of the account through February 2026. Some analysis scripts already existed inside ByTheWeiCo, a separate archival visualization project. They computed Shannon entropy, Zipf exponents, and a 20-tag heuristic taxonomy using regex classifiers. But they were tangled into a larger codebase, reading from flat files, with no database, no live sync, and no standalone interface.

The user's first instruction was simple: extract the Threads analysis into its own project.

## Phase 1: Bootstrap and Infrastructure

Claude pulled the analysis scripts, API adapter, data symlink, and documentation into a clean `threads-analysis/` directory with its own `package.json`. The existing pipeline was already non-trivial: `information-theory.mjs` (a 300+ line Shannon analysis engine), `knowledge-graph.mjs` (PMI-weighted co-occurrence with TF-IDF concept extraction), `sub-classifiers.mjs` (35 sub-tags across 9 parent categories using keyword regex), and a pure-function library (`info-theory-lib.mjs`) exporting entropy, surprise, mutual information, and normalized PMI.

Then the user escalated: they wanted a Postgres database that captured "every single thing" the Threads API can return, plus an automated sync worker running on a 30-minute interval inside Docker.

Claude produced four files that form the backbone of the entire system:

**`db/init.sql`** -- 263 lines defining 13 tables, 2 enums, a materialized view, and a GIN full-text search index. The schema covers posts, carousel items, time-series metrics snapshots, tags, sub-tags, surprise scores, knowledge graph nodes and edges, conversations, sync logs, token management, and corpus-level snapshots. Foreign keys link replies to parent posts. The materialized view (`metrics_latest`) provides fast access to the most recent engagement snapshot per post, refreshable concurrently.

**`scripts/db.mjs`** -- A lazy-initialized connection pool with 12 upsert helpers. Every function accepts an optional `client` parameter, enabling both standalone use and participation in explicit transactions. The carousel insert uses multi-row `VALUES` clauses instead of looping N+1 individual inserts. Slow queries over 1 second are logged automatically.

**`scripts/sync-worker.mjs`** -- The Docker entrypoint. Each 30-minute cycle fetches posts and replies in parallel via `Promise.all`, upserts them in batched transactions of 500, pulls engagement metrics for recent posts, fetches conversation replies from other users, and logs the entire run to `sync_log`. Graceful shutdown uses an `AbortController` that interrupts the sleep timer on SIGTERM/SIGINT, so Docker stop completes cleanly instead of hanging for 30 minutes.

**`scripts/db-seed.mjs`** -- A one-shot backfill script that loads the full `posts.json` and pushes it through the same upsert pipeline. It seeded 45,938 posts at approximately 4,365 posts per second -- the entire corpus in about 10.5 seconds.

The Docker setup is a two-service compose file: Postgres 17 Alpine with a health check, and a Node 22 Alpine worker that waits for the database to be ready before starting its loop.

## Phase 2: Code Review and Deduplication

Before moving forward, Claude ran a `/simplify` pass that launched three parallel review agents examining the codebase for reuse opportunities, code quality issues, and performance bottlenecks. The review identified approximately 150 lines of duplicated API interaction logic spread across four files (`threads-sync.mjs`, `threads-backfill-metrics.mjs`, `threads-backfill-replies.mjs`, and the new sync worker). The fix was a shared `scripts/lib/threads-api.mjs` module -- 154 lines that became the single source of truth for API constants, paginated fetching, metrics retrieval, env loading, and argument parsing. Every script now imports from the same place.

The review also caught specific issues: the carousel insert was doing one `INSERT` per child item (N+1), error details arrays could grow unbounded, and the sync worker lacked transaction batching. All fixed.

## Phase 3: Blind Validation

This is where the process gets interesting. Rather than trusting its own output, Claude launched an independent validation agent with zero prior context about the project. This agent had to discover the codebase from scratch, understand the architecture, and verify that everything works.

The validator executed 61 tool calls: reading `package.json` and `CLAUDE.md` to understand the project, tracing imports through the module graph, inspecting the Docker configuration, verifying the Postgres schema, and checking that every script could parse without errors. It tested that `docker compose config` validated correctly, confirmed the sync worker's shutdown handling, and verified the data pipeline's output files. Every check passed. The validator described the sync worker as "production-quality."

Using AI to audit AI-generated code is a pattern worth noting. The blind validator has no sunk-cost bias toward making the code look good -- it has never seen it before. It examines what is actually there, not what was intended.

## Phase 4: The Astro Dashboard

The user wanted visualization. Claude entered plan mode and launched three explore agents in parallel: one to study the existing codebase and data structures, one to examine the user's other Astro projects (ByTheWeiCo and bythewei.dev) for design conventions, and one to survey the available data shapes. A Plan agent then synthesized a full architecture: Astro 5 with hybrid rendering (static pages for analysis views, server-rendered for live API routes), React islands for interactive components, a dark theme design system, and a sidebar navigation shell.

The resulting dashboard has 6 pages and 6 API routes:

**Static pages** render at build time from the JSON analysis outputs:
- **Overview** -- stat cards (total posts, vocabulary size, word entropy, Zipf exponent, tag entropy, bigram entropy, average surprise), a squarified treemap, and a tag distribution bar chart. All SVG, generated server-side.
- **Taxonomy** -- treemap with nested sub-tags, coverage analysis for the 9 parent categories with sub-classification.
- **Chronology** -- time-series heatmap, posting patterns by hour and day of week, temporal tag evolution.
- **Discourse** -- deep-dive into the 9 discourse categories (race, sex-gender, philosophy, tech, political, reaction, one-liner, question, media), with sample posts per sub-tag.

**Server-rendered pages** hit Postgres in real time:
- **Network** -- interactive force-directed knowledge graph (1,638 nodes, 11,155 edges) rendered via `force-graph` as a React island. Controls let you toggle edge types (co-occurrence, temporal, hierarchy, concept link, bridge link), node types, search, and filter by minimum weight.
- **Explore** -- full-text search against the GIN index, filterable by tag, date range, surprise score, post variety, sortable by date/surprise/views/likes/replies/word count.

**API routes** (`/api/posts`, `/api/tags`, `/api/graph`, `/api/metrics`, `/api/search`, `/api/sync-status`) serve JSON from Postgres with parameterized queries, input validation, sort-column whitelisting against injection, and proper error responses.

The design system uses CSS custom properties for a GitHub-dark aesthetic: `#0d1117` background, `#161b22` secondary surface, `#58a6ff` accent, 20 tag-specific colors, and SF Mono for data. The sidebar navigation is responsive, collapsing to icon-only on mobile.

## Phase 5: The CTO Pattern

The final build sprint is where Claude Code's parallelism was used most aggressively. The user said "use multiple agents, you're the CTO." Claude launched four agents simultaneously:

- **Phase 2 agent**: static Astro pages (taxonomy, chronology, discourse)
- **Phase 3 agent**: all 6 API routes with Postgres queries
- **Phase 4 agent**: React islands (KnowledgeGraph, PostExplorer, FilterBar, GraphControls, SyncIndicator, PostList)
- **Phase 5 agent**: analysis pipeline writing computed results back to Postgres (tags, sub-tags, surprise scores, knowledge graph nodes and edges)

Plus a validation agent running in parallel to verify the output of the other four.

This is delegation at scale. Instead of writing one file at a time, the session treated Claude Code as a team of specialists working in parallel, with the main thread acting as coordinator. The result was 29 source files in `src/` alone, plus the infrastructure layer -- approximately 6,800 lines of code across 44 files.

## By the Numbers

| Metric | Value |
|--------|-------|
| Posts in corpus | 37,912 (with text, filtered from ~46K) |
| Primary tags | 20 |
| Sub-tags | 35 |
| Knowledge graph nodes | 1,638 |
| Knowledge graph edges | 11,155 |
| Database tables | 13 + 1 materialized view |
| API routes | 6 |
| Astro pages | 6 |
| React components | 6 |
| Vocabulary size | 25,804 unique words |
| Word entropy | 10.376 bits |
| Zipf exponent | 0.999 |
| Database seed time | ~10.5 seconds (45,938 posts) |
| Seed throughput | ~4,365 posts/sec |
| Sync interval | 30 minutes (configurable) |
| Source files | 44 |
| Lines of code | ~6,800 |
| Schema (init.sql) | 263 lines |

## What Makes This Interesting

Three patterns from this session stand out for anyone thinking about AI-assisted development:

**Blind validation as quality gate.** Launching a separate agent with no context to independently audit the project is a genuinely useful technique. It catches assumptions that the building agent (and the human) share but that do not hold. It also produces a clean assessment unburdened by the narrative of "here is what I was trying to do."

**Parallel agents as a build team.** The CTO pattern -- launching 4-5 agents simultaneously on different layers of the stack -- is a force multiplier that works particularly well for projects with clear interface boundaries. The API routes do not need to know how the React components render. The analysis pipeline does not need to know about the Astro layout. Parallelism is natural.

**AI reviewing AI code.** The `/simplify` pass that found 150 lines of duplication across 4 files is something a human reviewer would also catch -- but it happened automatically, before the human had to look. The refactoring into `threads-api.mjs` was mechanical but important: it eliminated a class of bugs where one script's fetch logic drifts from another's.

The end result is a platform that treats a personal social media corpus with the same analytical rigor you would apply to a research dataset: information-theoretic measurement, taxonomic classification, graph-theoretic co-occurrence analysis, time-series engagement tracking, full-text search, and a live sync pipeline that keeps everything current. The fact that it was built in a single session -- from "extract these scripts" to "here is your running dashboard" -- says something about where AI-assisted development is heading. Not replacing the developer's judgment about what to build, but compressing the distance between "I want this" and "this exists."
