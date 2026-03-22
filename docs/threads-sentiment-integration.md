# Threads Sentiment Integration — ai-hedge-fund

> How to connect the Threads keyword search API to the ai-hedge-fund trading system as a real-time social sentiment signal.

## The Opportunity

The ai-hedge-fund project currently uses two LLM-based sentiment agents:
- `sentiment_analyst` — LLM guesses market sentiment (no real data)
- `news_sentiment_analyst` — LLM classifies news headlines (real data, but news-only)

**The Threads keyword search API provides real social sentiment from 200M+ users — for free.** This replaces LLM guessing with actual crowd behavior.

## API Endpoint

```
GET https://graph.threads.net/v1.0/keyword_search
  ?q={keyword}
  &media_type=TEXT
  &since=2026-03-20
  &until=2026-03-22
  &access_token={token}
```

**Rate limit**: 500 searches per 7-day rolling window (~71/day)

**Auth**: Uses the same OAuth token from threads-analysis project (`.env` → `THREADS_ACCESS_TOKEN`). The token is already refreshable and managed.

## Tiered Search Strategy (71 searches/day)

| Tier | Searches/day | Strategy |
|------|-------------|----------|
| **Daily themes** | 22 | One search per portfolio theme (from Finviz 22 portfolio templates) |
| **Triggered movers** | ~20 | Top 10 gainers + top 10 losers from latest Finviz pull |
| **Rotating tickers** | ~29 | High-interest individual tickers on a round-robin cycle |
| **Total** | **71/day** | Well under the 500/week cap |

### Daily Theme Queries (map to Finviz portfolios)
```
"AI stocks"           → ai_leaders portfolio
"dividend stocks"     → dividend_aristocrats portfolio
"defense spending"    → defense_sector portfolio
"biotech FDA"         → biotech_pipeline portfolio
"crypto stocks"       → crypto_exposure portfolio
"EV stocks"           → ev_ecosystem portfolio
"semiconductor"       → semiconductor portfolio
"cloud computing"     → cloud_saas portfolio
"cybersecurity"       → cybersecurity portfolio
"nuclear energy"      → nuclear_energy portfolio
... (22 total, one per portfolio template)
```

### Triggered Movers (from Finviz screener)
After each Finviz data pull, search for the top movers:
```python
# Pseudocode
top_gainers = finviz_client.screener(filters={"performance": "today_up"}, limit=10)
top_losers = finviz_client.screener(filters={"performance": "today_down"}, limit=10)
for ticker in top_gainers + top_losers:
    results = threads_search(f"${ticker.symbol}")
```

### Rotating Tickers
Cycle through a watchlist of ~200 high-interest tickers, searching ~29/day:
```python
watchlist = ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "META", "GOOG", ...]
daily_batch = watchlist[day_index * 29 : (day_index + 1) * 29]
```

## Sentiment Scoring (No LLM Required)

Score each post with simple keyword heuristics — fast, free, deterministic:

```python
BULLISH = {"buy", "moon", "undervalued", "breakout", "calls", "bull", "long",
           "accumulate", "dip", "upside", "growth", "beat", "squeeze"}
BEARISH = {"sell", "crash", "overvalued", "puts", "bear", "short", "dump",
           "bubble", "downside", "miss", "fraud", "scam", "baghold"}

def score_post(text: str) -> float:
    """Returns sentiment score from -1 (bearish) to +1 (bullish)."""
    words = set(text.lower().split())
    bull = len(words & BULLISH)
    bear = len(words & BEARISH)
    total = bull + bear
    if total == 0:
        return 0.0
    return (bull - bear) / total
```

Engagement-weighted aggregate:
```python
def aggregate_sentiment(posts: list) -> dict:
    """Weighted average by engagement (views + likes)."""
    total_weight = 0
    weighted_score = 0
    for post in posts:
        weight = (post.get("views", 1) + post.get("likes", 0) * 10)
        weighted_score += score_post(post["text"]) * weight
        total_weight += weight
    return {
        "sentiment": weighted_score / max(total_weight, 1),
        "volume": len(posts),
        "total_engagement": total_weight,
    }
```

## Database Schema

Add to the ai-hedge-fund Postgres (or use threads-analysis's Postgres on port 5433):

```sql
CREATE TABLE IF NOT EXISTS threads_sentiment (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    query TEXT NOT NULL,                    -- search term ("$NVDA", "AI stocks")
    query_type TEXT NOT NULL,               -- 'ticker', 'theme', 'triggered'
    searched_at TIMESTAMPTZ DEFAULT NOW(),
    posts_found INT DEFAULT 0,
    sentiment_score REAL,                   -- -1 to +1 weighted average
    sentiment_volume INT,                   -- number of scoreable posts
    bullish_count INT,
    bearish_count INT,
    neutral_count INT,
    total_engagement INT,                   -- sum of views + likes
    raw_posts JSONB,                        -- full API response preserved
    UNIQUE (query, searched_at)
);

CREATE INDEX idx_threads_sentiment_query ON threads_sentiment(query);
CREATE INDEX idx_threads_sentiment_time ON threads_sentiment(searched_at DESC);
```

## Integration with ai-hedge-fund Agents

### Option A: New Mechanical Agent (recommended)

Create `src/agents/threads_sentiment.py` alongside the existing agents:

```python
# src/agents/threads_sentiment.py
"""
Threads Social Sentiment Analyst — real social data, no LLM.
Queries threads_sentiment table for latest scores per ticker.
"""

def threads_sentiment_agent(state: AgentState) -> dict:
    tickers = state["data"]["tickers"]
    signals = {}
    for ticker in tickers:
        # Query threads_sentiment for this ticker
        rows = db.query(
            "SELECT sentiment_score, sentiment_volume, total_engagement "
            "FROM threads_sentiment "
            "WHERE query = %s AND searched_at > NOW() - INTERVAL '7 days' "
            "ORDER BY searched_at DESC LIMIT 7",
            [f"${ticker}"]
        )
        if not rows:
            signals[ticker] = {"signal": "neutral", "confidence": 0}
            continue

        avg_sentiment = sum(r.sentiment_score for r in rows) / len(rows)
        avg_volume = sum(r.sentiment_volume for r in rows) / len(rows)

        signal = "bullish" if avg_sentiment > 0.15 else "bearish" if avg_sentiment < -0.15 else "neutral"
        confidence = min(abs(avg_sentiment) * avg_volume / 100, 1.0)

        signals[ticker] = {
            "signal": signal,
            "confidence": round(confidence, 2),
            "sentiment_score": round(avg_sentiment, 3),
            "social_volume": int(avg_volume),
            "data_points": len(rows),
        }

    return {"data": {"analyst_signals": {"threads_sentiment_analyst": signals}}}
```

Register in `src/utils/analysts.py`:
```python
ANALYST_CONFIG["threads_sentiment_analyst"] = {
    "display_name": "Threads Social Sentiment",
    "agent_func": threads_sentiment_agent,
    "category": "mechanical",
    "order": 7,
}
```

### Option B: Augment Existing sentiment_analyst

Feed the Threads data into the existing `sentiment_analyst` LLM prompt as additional context. Less ideal — adds LLM cost for what should be a deterministic computation.

## Data Pipeline

### Search Worker Script

Create `src/tools/threads_search.py` in the ai-hedge-fund project:

```python
"""
Threads keyword search worker.
Runs on a cron schedule, searches for tickers + themes,
scores sentiment, stores results in Postgres.
"""
import os
import requests
from datetime import datetime, timedelta

BASE = "https://graph.threads.net/v1.0"
TOKEN = os.environ["THREADS_ACCESS_TOKEN"]

def search_threads(query: str, since_days: int = 1) -> list:
    since = (datetime.now() - timedelta(days=since_days)).strftime("%Y-%m-%d")
    url = f"{BASE}/keyword_search"
    params = {
        "q": query,
        "media_type": "TEXT",
        "since": since,
        "access_token": TOKEN,
    }
    resp = requests.get(url, params=params)
    resp.raise_for_status()
    return resp.json().get("data", [])
```

### Cron Schedule

Add to Docker Compose (or run as a separate service):
```yaml
threads-sentiment:
  build: .
  command: python src/tools/threads_search_worker.py
  environment:
    THREADS_ACCESS_TOKEN: ${THREADS_ACCESS_TOKEN}
    DATABASE_URL: ${DATABASE_URL}
  depends_on:
    postgres:
      condition: service_healthy
```

Run 3x/day (morning, midday, evening) to capture sentiment shifts:
```
0 8,13,18 * * * python src/tools/threads_search_worker.py
```

## Cross-Project Connection

```
threads-analysis (port 5433)          ai-hedge-fund
────────────────────────────          ─────────────
Threads OAuth token (shared)    ←──→  .env symlink or copy
keyword_search API              ────→  threads_search_worker.py
                                       ↓
                                threads_sentiment table
                                       ↓
                                threads_sentiment_agent
                                       ↓
                                portfolio_manager (composite signal)
```

Both projects share the same Threads API token. The simplest approach:
1. Add `THREADS_ACCESS_TOKEN` to ai-hedge-fund's `.env`
2. The search worker runs independently of threads-analysis
3. Sentiment data goes into ai-hedge-fund's own Postgres (or shared on 5433)

## What This Replaces

| Before | After |
|--------|-------|
| `sentiment_analyst` — LLM guesses sentiment from ticker name alone | `threads_sentiment_analyst` — real social data from 200M users |
| `news_sentiment_analyst` — LLM classifies news headlines ($$$ API calls) | Augmented with social volume signal (free) |
| No social data at all | 71 searches/day × 7 days = 497 data points/week |

## Estimated Value

- **Cost**: $0 (Threads API is free, no LLM calls for scoring)
- **Latency**: ~2s per search (API response time)
- **Signal quality**: Real crowd behavior > LLM hallucination
- **Coverage**: 200M+ Threads users discussing markets
- **Differentiation**: Most quant systems use Twitter/X API ($100/mo+) or news APIs. Threads is untapped.
