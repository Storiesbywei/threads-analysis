# Threads Analysis — Kanban

## Done

- **Tag taxonomy refresh**: shitpost → unclassified across ByTheWeiCo (6 files) — 2026-04-23
- **New clusters.astro page** on ByTheWeiCo (UMAP scatter, cluster cards, bridges) — 2026-04-23
- **Sub-nav update**: added Clusters link to all 5 threads sub-pages — 2026-04-23
- **Index page threads integration**: threads-strip with post count + links — 2026-04-23
- **Marginalia component**: Threads stat now links to /glyphary/threads — 2026-04-23
- **Fresh data export**: 43,156 posts, 1,844 nodes, 13,022 edges — 2026-04-23
- **Data files exported**: clusters.json, umap-scatter.json, palace-topology.json — 2026-04-23
- Embedding models fixed (mxbai, snowflake, granite removed, nomic updated to v2-moe)

## In Progress

- **Auto-export pipeline stage (Stage 7)** — script to auto-run analyze + export to ByTheWeiCo

## Backlog

- **~~Fix Pipeline Stage 6 Sentiment LLM (Ollama 404)~~** — DONE (2026-04-24): swapped to `qwen3.5`
  - After fix: restart pipeline, validate zero-sentiment drops below 50%
- **Monthly cron** to auto-push ByTheWeiCo data updates
- **5 remaining praxis interactions** for apple-accessibility essay (VoiceOver sim, Switch Control, Braille display, Point and Speak, VoiceOver rotor)
