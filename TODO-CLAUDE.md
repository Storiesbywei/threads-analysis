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
- **Auto-export pipeline Stage 7** — runs analyze + exports 5 files to ByTheWeiCo — 2026-04-24
- **Pipeline Stage 6 Sentiment LLM fixed** — swapped gemma4:e4b → qwen3.5 — 2026-04-24
- **Dual LLM setup**: MLX Gemma 4 E4B (primary, 50 tok/s) + Ollama qwen3.5 (fallback) — 2026-04-24
- **All scripts updated** to qwen3.5: haiku-agent, enrich-sentiment-llm, cluster-explorer, palace/rename, palace/navigate, api-server — 2026-04-24
- **Haiku agent working**: MLX Gemma 4 E4B with thinking disabled, iMessage apostrophe escaping fixed — 2026-04-24
- **Flask API logging**: gunicorn access logs + `/logs` endpoint (in-memory ring buffer, last 100 requests) — 2026-04-24
- **`/stats/top/recent` endpoint**: top posts from last N days by metric (was missing, caused wrong iOS Shortcut routing) — 2026-04-24
- **`llms.txt` rewritten**: 64 endpoints documented (was 27), post count/sync interval/tags corrected — 2026-04-24
- **Swagger/OpenAPI**: new endpoints tagged for /docs UI — 2026-04-24
- **Docker intervals updated**: sync 30min → 60min, pipeline 24h → 336h (2 weeks) — 2026-04-24
- **MLX server config**: `--chat-template-args '{"enable_thinking":false}'` disables reasoning output — 2026-04-24
- **Both projects pushed**: ByTheWeiCo `5e33351` master, threads-analysis `43637e9` main — 2026-04-24

## In Progress

(none)

## Backlog

- **Stale model refs across 6 projects**: llama3.2:3b (removed), nomic-embed-text v1 (replaced), qwen3:14b (replaced) — plex-claude, shortcuts-agentic, gemma-library-of-babel, projects-status.md
- **GEMMA_MODEL naming confusion**: 3 Python scripts (cluster-explorer, navigate, rename_clusters) have env var `GEMMA_MODEL` defaulting to `qwen3.5` — rename to `LLM_MODEL`
- **MLX server auto-start**: add launchd plist or Docker service for `mlx_lm.server` on boot (port 8899)
- **Centralize model config**: single env file or config that all projects read for model names
- **`/posts/semantic-search` 500 error**: needs Ollama to embed query vector at runtime — fix or remove
- **5 remaining praxis interactions** for apple-accessibility essay (VoiceOver sim, Switch Control, Braille display, Point and Speak, VoiceOver rotor)
