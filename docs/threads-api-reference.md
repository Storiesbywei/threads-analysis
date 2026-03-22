# Threads API — Technical Reference for ByTheWei.co

*Researched February 19, 2026*

---

## Status

The Threads API is **publicly available** (since June 2024). Base URL:

```
https://graph.threads.net/v1.0/
```

Personal-use apps accessing your own account require no business verification.

---

## Authentication — OAuth 2.0

### Setup
1. Register at [developers.meta.com](https://developers.meta.com)
2. Create app → select "Access the Threads API"
3. Required scopes for read-only archive: `threads_basic` + `threads_manage_insights` + `threads_read_replies`

### Token Flow
```
1. Authorization → GET https://threads.net/oauth/authorize
     ?client_id={app-id}&redirect_uri={uri}&scope=threads_basic,threads_manage_insights&response_type=code

2. Exchange code → POST https://graph.threads.net/oauth/access_token
     Body: code, client_id, client_secret, redirect_uri, grant_type=authorization_code
     Returns: short-lived token (1 hour)

3. Long-lived token → GET https://graph.threads.net/access_token
     ?grant_type=th_exchange_token&client_secret={secret}&access_token={short-lived}
     Returns: 60-day token

4. Refresh → GET https://graph.threads.net/refresh_access_token
     ?grant_type=th_refresh_token&access_token={long-lived}
     Refreshable after first 24 hours, before expiry
```

---

## Key Endpoints

### Fetch User's Posts (paginated)
```
GET /{user-id}/threads
  ?fields=id,text,media_type,media_url,permalink,shortcode,timestamp,
          thumbnail_url,children,is_quote_post,owner,username
  &limit=100
  &since=2024-01-01
  &until=2026-02-19
  &access_token={token}
```

### Post-Level Metrics
```
GET /{media-id}/insights
  ?metric=views,likes,replies,reposts,quotes,shares
  &access_token={token}
```
Metrics available from **April 13, 2024** onward only.

### User's Reply Posts (paginated)
```
GET /{user-id}/replies
  ?fields=id,text,media_type,media_url,permalink,shortcode,timestamp,
          thumbnail_url,children,is_quote_post,owner,username
  &limit=100
  &since=2024-01-01
  &access_token={token}
```
Scope: `threads_read_replies`. Same pagination pattern as `/threads`.
Returns all posts the user has made as replies to other threads.

### Post Replies (on a specific post)
```
GET /{media-id}/replies?fields=id,text,timestamp,username&access_token={token}
```

### Full Conversation
```
GET /{media-id}/conversation&access_token={token}
```

### Keyword Search (public posts)
```
GET /keyword_search?q={keyword}&media_type=TEXT&since=...&until=...&access_token={token}
```

---

## Rate Limits

| Operation | Limit |
|-----------|-------|
| Published posts | 250 / 24h rolling |
| Published replies | 1,000 / 24h rolling |
| Keyword searches | 500 / 7-day rolling |
| Read GET requests | Undocumented; use exponential backoff |

---

## Data Fields Per Post

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique media ID |
| `text` | string | Post body (max 500 chars) |
| `media_type` | enum | TEXT, IMAGE, VIDEO, CAROUSEL_ALBUM |
| `media_url` | string | Image/video URL |
| `permalink` | string | Public threads.net URL |
| `timestamp` | ISO 8601 | Publication time |
| `is_quote_post` | boolean | Whether it quotes another post |
| `children` | array | Carousel child media IDs |
| `shortcode` | string | URL short identifier |

**Metrics (via /insights):** views, likes, replies, reposts, quotes, shares

---

## What You CANNOT Get

- Other users' private data or metrics
- DMs (no endpoint exists)
- Metrics before April 13, 2024
- Unauthenticated read access (token always required)
- Delete via API (app-only)
- View counts on others' posts

---

## Integration Pattern for ByTheWei.co

### Architecture
```
Threads API
  ↓ OAuth long-lived token (env var)
GitHub Actions cron (every 6h or daily)
  ↓ threads-sync.mjs (paginated fetch + metrics)
data/threads/posts.json (committed or stored in KV)
  ↓ threads-adapter.js (normalize to unified event schema)
public/data/{year}/{month}/{day}.json (DIP)
  ↓ Astro build
ByTheWei.co
```

### Token Refresh Strategy
Weekly GitHub Actions job calls refresh endpoint, stores new token to GitHub Secrets via `gh secret set`.

### Incremental Sync
Store `last_fetched` timestamp. On each run, pass `since=last_fetched`. Re-fetch metrics for posts from last 7 days (engagement accumulates).

### Fetch Script Skeleton
```js
// scripts/threads-sync.mjs
const BASE = 'https://graph.threads.net/v1.0';
const TOKEN = process.env.THREADS_ACCESS_TOKEN;
const USER_ID = process.env.THREADS_USER_ID;

const FIELDS = 'id,text,media_type,media_url,thumbnail_url,permalink,shortcode,timestamp,is_quote_post,children';

async function fetchAllPosts(since) {
  const posts = [];
  let url = `${BASE}/${USER_ID}/threads?fields=${FIELDS}&limit=100&access_token=${TOKEN}`;
  if (since) url += `&since=${since}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    posts.push(...json.data);
    url = json.paging?.next ?? null;
  }
  return posts;
}

async function fetchMetrics(postId) {
  const res = await fetch(
    `${BASE}/${postId}/insights?metric=views,likes,replies,reposts,quotes,shares&access_token=${TOKEN}`
  );
  const json = await res.json();
  return Object.fromEntries(json.data.map(m => [m.name, m.values[0].value]));
}
```

### Unified Event Schema Mapping
```json
{
  "event_id": "byw-threads-{post_id}",
  "ts_iso": "{timestamp}",
  "source": "threads",
  "type": "social_post",
  "payload": {
    "platform": "threads",
    "post_text": "{text}",
    "media_count": 0,
    "media_types": [],
    "permalink": "",
    "engagement": { "views": 0, "likes": 0, "replies": 0, "reposts": 0, "quotes": 0, "shares": 0 },
    "is_quote_post": false,
    "reply_to": null
  }
}
```

---

## Alternative Bootstrap: Meta Data Download

Threads app → Settings → Account → Your Information → Download Your Information → JSON export. No metrics included, but useful for one-time historical seed before API integration.
