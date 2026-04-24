---
title: "Building a 49K-Post Analysis Platform in One Claude Code Session"
description: "How I used parallel agents, blind validation, and the CTO pattern to build a full-stack data platform"
tags: ["claude-code", "ai-development", "information-theory", "threads"]
date: 2026-03-22
---

I built a 49K-post analysis platform with a knowledge graph, force-directed visualizations, and a live Postgres sync pipeline in one Claude Code session. Here is how.

## What I Was Trying to Do

I have about 46,000 posts on Threads under @maybe_foucault. I wanted to study my own posting behavior -- not through vibes, but through actual information theory. Shannon entropy, Zipf distributions, surprise scores, topic co-occurrence networks. The kind of analysis you would run on a research corpus, applied to my own social media output.

Some analysis scripts already existed inside another project (ByTheWeiCo), but they were tangled into a larger codebase, reading from flat JSON, with no database, no sync pipeline, and no standalone interface. The first instruction to Claude Code was simple: extract the Threads analysis into its own project.

That was the last simple instruction.

## The CTO Pattern

The technique that made this session work was treating Claude Code not as a single assistant but as a team. The key insight: Claude Code can spawn sub-agents that work in parallel on non-overlapping tasks.

Here is what that looked like in practice.

**Phase 1 -- Infrastructure.** One agent built out the Postgres schema (13 tables, 2 enums, a materialized view, a GIN full-text search index -- 263 lines of SQL), the database module with 12 upsert helpers, the Docker Compose stack, and a seed script. That seed script loaded the entire 46K-post corpus in 10.5 seconds at roughly 4,365 posts/sec.

**Phase 2 -- Code review with `/simplify`.** Before building the dashboard, I ran `/simplify`, which launched three parallel review agents examining the codebase for duplication, quality issues, and performance bottlenecks. They found approximately 150 lines of duplicated API logic spread across four files. The fix was a shared `scripts/lib/threads-api.mjs` module -- 154 lines that became the single source of truth for pagination, metrics fetching, env loading, and argument parsing. They also caught an N+1 insert pattern in the carousel handler.

**Phase 3 -- Blind validation.** This is my favorite part. Instead of trusting the build agent's output, I launched a separate agent with zero prior context about the project. It had to discover the codebase from scratch, understand the architecture, and verify that everything works. It executed 61 tool calls -- reading package.json, tracing the import graph, validating the Docker config, checking the Postgres schema. Every check passed. It described the sync worker as "production-quality."

The reason this matters: the blind validator has no sunk-cost bias. It has never seen the code before. It examines what is actually there, not what was intended.

**Phase 4 -- The build sprint.** I told Claude Code: "You're the CTO. Delegate to agents." It launched five agents simultaneously:

- Agent 1: Static Astro pages (taxonomy, chronology, discourse)
- Agent 2: All 7 API routes with parameterized Postgres queries
- Agent 3: React islands (KnowledgeGraph, PostExplorer, InteractionNetwork, FilterBar, GraphControls, SyncIndicator, PostList)
- Agent 4: Analysis pipeline writing computed results back to Postgres
- Agent 5: A validator running in parallel, checking the other four

This is delegation at scale. Instead of writing one file at a time, the session produced 7 pages, 7 API routes, and 7 React components in a single coordinated push.

## What Got Built

The final platform, by the numbers:

| What | How Much |
|------|----------|
| Posts in corpus | 37,912 with text (filtered from ~46K) |
| Postgres tables | 13 + 1 materialized view |
| Astro pages | 7 (overview, taxonomy, chronology, discourse, network, interactions, explore) |
| API routes | 7 (posts, tags, graph, metrics, search, sync-status, interactions) |
| React islands | 7 (including a force-directed knowledge graph and an interaction network) |
| Knowledge graph | 1,638 nodes, 11,155 edges |
| Interaction network | 409 users, 1,668 interactions mapped |
| Vocabulary size | 25,804 unique words |
| Word entropy | 10.376 bits |
| Zipf exponent | 0.999 (essentially perfect Zipfian) |
| Source files | ~50 |
| Lines of code | ~7,600 |
| Database seed time | 10.5 seconds |

The information theory pipeline classifies every post into a 20-tag taxonomy with 35 sub-tags, computes per-post surprise scores (self-information in bits per word), measures mutual information between tags and contextual features, and tracks topic transition entropy using a Markov chain over consecutive posts.

The knowledge graph uses PMI-weighted co-occurrence edges, temporal proximity via a 5-post sliding window, TF-IDF concept extraction, and bridge concepts spanning 3+ categories. It renders as an interactive force-directed graph with controls for toggling edge types, filtering, and search.

The sync worker runs in Docker alongside Postgres 17 Alpine. Every 30 minutes it fetches posts and replies in parallel, upserts in batched transactions of 500, pulls engagement metrics, and logs to a `sync_log` table. Graceful shutdown uses an `AbortController` on SIGTERM so `docker stop` completes cleanly.

```yaml
# docker compose up -d and you're live
services:
  postgres:
    image: postgres:17-alpine
    ports: ["5433:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U threads -d threads"]
  sync:
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      SYNC_INTERVAL_MINUTES: 30
```

## The Meta Moments

A few things happened during this session that felt genuinely novel.

**AI reviewing AI code.** The `/simplify` pass that caught 150 lines of duplication is something a human reviewer would also catch -- but it happened automatically, before I had to look. The refactoring into a shared API module was mechanical but important: it eliminated a class of bugs where one script's fetch logic drifts from another's.

**The auditor agent.** After the platform was built, I spawned an agent with a specific persona -- expertise in social media analytics, information theory, and digital marketing -- and asked it to audit the platform. It produced a 460-line report identifying 8 information-theory gaps (KL divergence timelines, perplexity trends, entropy rate estimation), 6 social media analytics gaps (engagement prediction, virality signals, optimal posting schedule), 5 marketing intelligence gaps, and 14 concrete feature proposals with priority rankings. Several of these (like surfacing mutual information values that were already computed but only logged to console) were immediate wins I hadn't noticed.

**Cross-project pollination.** The audit led to a design document for integrating Threads keyword search data into a separate project (ai-hedge-fund) as a social sentiment signal. Instead of using an LLM to guess market sentiment from a ticker name, query actual Threads posts from 200M+ users and score them with keyword heuristics. Free API, no LLM cost, real crowd behavior. The 500 searches per 7-day rolling window supports 71 daily queries across portfolio themes and triggered movers.

## What I Learned

**Parallel agents are a game changer for non-overlapping work.** The API routes do not need to know how the React components render. The analysis pipeline does not need to know about the Astro layout. When interface boundaries are clean, parallelism is natural and the speedup is real.

**Blind validation catches things building agents miss.** The validator with zero context has no narrative about what the code is supposed to do. It just reads what is there. This is a pattern I will use on every non-trivial build going forward.

**The CTO pattern works: delegate, do not micromanage.** Saying "you're the CTO, use agents" produced a better work breakdown than specifying tasks manually. The coordinator agent understood the dependency graph and allocated work across agents that would not step on each other's files.

**`/simplify` is underrated.** Three review agents in parallel found real duplication and real performance issues. Running it before the main build sprint meant the dashboard was built on a cleaner foundation.

**AI does not replace judgment about what to build.** Every decision about what analysis to run, what the taxonomy should look like, what the dashboard should surface -- those were mine. Claude Code compressed the distance between "I want this" and "this exists." It did not decide what "this" should be.

## What's Next

The audit proposed 14 new features. The four highest-priority ones -- KL divergence timeline, surprise-engagement scatter plot, engagement heatmap, and surfacing mutual information values -- could all be built in a single session since they require no new data, just SQL queries against existing tables and SVG rendering.

The sentiment integration with ai-hedge-fund is designed but not built. The architecture is ready: a search worker script, a `threads_sentiment` table, a mechanical agent that reads scores instead of asking an LLM to guess. Zero API cost, deterministic scoring, real social data.

The Zipf exponent at 0.999 is the finding I keep coming back to. My vocabulary follows natural language rank-frequency laws almost perfectly. I wrote 46,000 posts and the statistical structure of the language is indistinguishable from the theoretical ideal. I am not sure what to do with that information, but it is the kind of thing you can only discover when you point an information theory pipeline at your own corpus and actually look.
