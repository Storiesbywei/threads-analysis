"""Threads Analysis API — iOS Shortcuts + Swagger UI on :4323"""

import os
import random
from datetime import datetime, timedelta, timezone
from functools import wraps

import psycopg2
import psycopg2.pool
from flask import request
from flask_cors import CORS
from flask_openapi3 import Info, OpenAPI
from pydantic import BaseModel, Field


class TagPath(BaseModel):
    tag: str = Field(..., description="Topic tag name")


class PostIdPath(BaseModel):
    post_id: str = Field(..., description="Post ID")

# ─── App setup ────────────────────────────────────────────────────

info = Info(
    title="Threads Analysis API",
    version="1.0.0",
    description="iOS Shortcuts-friendly API for @maybe_foucault Threads analytics",
)
app = OpenAPI(__name__, info=info, doc_prefix="/docs")
CORS(app)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://threads:threads_local_dev@localhost:5433/threads",
)

pool = psycopg2.pool.ThreadedConnectionPool(1, 10, DATABASE_URL)


# ─── Helpers ──────────────────────────────────────────────────────


def get_conn():
    return pool.getconn()


def put_conn(conn):
    pool.putconn(conn)


def utcnow():
    return datetime.now(timezone.utc)


def ago(dt):
    """Human-readable relative time string."""
    if dt is None:
        return None
    now = utcnow()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = now - dt
    secs = int(delta.total_seconds())
    if secs < 60:
        return f"{secs} seconds ago"
    mins = secs // 60
    if mins < 60:
        return f"{mins} minute{'s' if mins != 1 else ''} ago"
    hours = mins // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    if days == 1:
        return "yesterday"
    if days < 30:
        return f"{days} days ago"
    months = days // 30
    if months < 12:
        return f"{months} month{'s' if months != 1 else ''} ago"
    years = days // 365
    return f"{years} year{'s' if years != 1 else ''} ago"


def iso(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def post_row_to_dict(row, cols):
    """Convert a row tuple + column names into a post dict."""
    d = dict(zip(cols, row))
    return {
        "id": d["id"],
        "text": d.get("text"),
        "timestamp": iso(d["timestamp"]),
        "ago": ago(d["timestamp"]),
        "variety": d.get("variety"),
        "tags": (d.get("tags") or "").split(",") if d.get("tags") else [],
        "primary_tag": d.get("primary_tag"),
        "surprise": d.get("surprise"),
        "word_count": d.get("word_count"),
        "permalink": d.get("permalink"),
        "metrics": {
            "views": d.get("views"),
            "likes": d.get("likes"),
            "replies": d.get("replies_count"),
        },
    }


POST_SELECT = """
    SELECT p.id, p.text, p.timestamp, p.variety, p.word_count, p.permalink,
           COALESCE(
             (SELECT string_agg(t.tag, ',' ORDER BY t.tag) FROM tags t WHERE t.post_id = p.id), ''
           ) AS tags,
           (SELECT t.tag FROM tags t WHERE t.post_id = p.id AND t.is_primary LIMIT 1) AS primary_tag,
           s.surprise,
           m.views, m.likes, m.replies AS replies_count
    FROM posts p
    LEFT JOIN surprise_scores s ON s.post_id = p.id
    LEFT JOIN metrics_latest m ON m.post_id = p.id
"""

POST_COLS = [
    "id", "text", "timestamp", "variety", "word_count", "permalink",
    "tags", "primary_tag", "surprise", "views", "likes", "replies_count",
]


def query_posts(where="", params=(), order="ORDER BY p.timestamp DESC", limit=None):
    sql = POST_SELECT
    if where:
        sql += f" WHERE {where}"
    sql += f" {order}"
    params = list(params)
    if limit:
        sql += " LIMIT %s"
        params.append(limit)

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [post_row_to_dict(r, POST_COLS) for r in rows]
    finally:
        put_conn(conn)


def query_one(sql, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()
    finally:
        put_conn(conn)


def query_all(sql, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [desc[0] for desc in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        put_conn(conn)


def posts_response(posts, query_meta):
    return {
        "posts": posts,
        "count": len(posts),
        "query": query_meta,
        "generated_at": iso(utcnow()),
    }


def data_response(data, query_meta):
    return {
        "data": data,
        "count": len(data) if isinstance(data, list) else 1,
        "query": query_meta,
        "generated_at": iso(utcnow()),
    }


# ─── Time-based endpoints ────────────────────────────────────────

TIME_WINDOWS = {
    "now": {"minutes": 30},
    "hour": {"hours": 1},
    "today": None,  # special: start of day
    "week": {"days": 7},
    "month": {"days": 30},
}

DEFAULT_TIME_LIMIT = 500
MAX_TIME_LIMIT = 1000


def _time_window_handler(window):
    """Create a handler for a time-window endpoint."""
    def handler():
        limit = min(int(request.args.get("limit", DEFAULT_TIME_LIMIT)), MAX_TIME_LIMIT)
        if window == "today":
            since = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            since = utcnow() - timedelta(**TIME_WINDOWS[window])
        posts = query_posts("p.timestamp >= %s", (since,), limit=limit)
        return posts_response(posts, {"type": "time", "window": window, "since": iso(since)})
    handler.__name__ = f"posts_{window}"
    handler.__doc__ = f"Posts in the '{window}' time window."
    return handler


for _window in TIME_WINDOWS:
    app.get(f"/posts/{_window}")(_time_window_handler(_window))


@app.get("/posts/since")
def posts_since():
    """Posts since N minutes ago. Query param: minutes (default 60)."""
    minutes = int(request.args.get("minutes", 60))
    limit = min(int(request.args.get("limit", DEFAULT_TIME_LIMIT)), MAX_TIME_LIMIT)
    since = utcnow() - timedelta(minutes=minutes)
    posts = query_posts("p.timestamp >= %s", (since,), limit=limit)
    return posts_response(posts, {"type": "time", "window": f"since_{minutes}m", "since": iso(since)})


@app.get("/posts/between")
def posts_between():
    """Posts between two ISO dates. Query params: from, to."""
    from_dt = request.args.get("from")
    to_dt = request.args.get("to")
    if not from_dt or not to_dt:
        return {"error": "Both 'from' and 'to' query params required (ISO format)"}, 400
    limit = min(int(request.args.get("limit", DEFAULT_TIME_LIMIT)), MAX_TIME_LIMIT)
    posts = query_posts(
        "p.timestamp >= %s AND p.timestamp <= %s", (from_dt, to_dt), limit=limit
    )
    return posts_response(posts, {"type": "time", "window": "between", "from": from_dt, "to": to_dt})


@app.get("/posts/latest")
def posts_latest():
    """Last N posts (default 10). Query param: n."""
    n = int(request.args.get("n", 10))
    posts = query_posts(limit=n)
    return posts_response(posts, {"type": "latest", "n": n})


# ─── Search & Discovery ──────────────────────────────────────────


@app.get("/posts/search")
def posts_search():
    """Full-text search. Query param: q."""
    q = request.args.get("q", "")
    if not q:
        return {"error": "'q' query param required"}, 400
    posts = query_posts(
        "to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', %s)",
        (q,),
        limit=50,
    )
    return posts_response(posts, {"type": "search", "q": q})


@app.get("/posts/tag/<tag>")
def posts_by_tag(path: TagPath):
    """Posts with a given tag."""
    tag = path.tag
    posts = query_posts(
        "EXISTS (SELECT 1 FROM tags t2 WHERE t2.post_id = p.id AND t2.tag = %s)",
        (tag,),
        limit=100,
    )
    return posts_response(posts, {"type": "tag", "tag": tag})


@app.get("/posts/tag/<tag>/latest")
def posts_tag_latest(path: TagPath):
    """Latest N posts in a tag. Query param: n (default 5)."""
    tag = path.tag
    n = int(request.args.get("n", 5))
    posts = query_posts(
        "EXISTS (SELECT 1 FROM tags t2 WHERE t2.post_id = p.id AND t2.tag = %s)",
        (tag,),
        limit=n,
    )
    return posts_response(posts, {"type": "tag_latest", "tag": tag, "n": n})


@app.get("/posts/random")
def posts_random():
    """A random post."""
    posts = query_posts(
        "p.variety != 'repost'",
        order="ORDER BY RANDOM()",
        limit=1,
    )
    return posts_response(posts, {"type": "random"})


@app.get("/posts/random/<tag>")
def posts_random_tag(path: TagPath):
    """A random post from a tag."""
    tag = path.tag
    posts = query_posts(
        "EXISTS (SELECT 1 FROM tags t2 WHERE t2.post_id = p.id AND t2.tag = %s)",
        (tag,),
        order="ORDER BY RANDOM()",
        limit=1,
    )
    return posts_response(posts, {"type": "random", "tag": tag})


@app.get("/posts/<post_id>")
def post_by_id(path: PostIdPath):
    """Single post by ID."""
    post_id = path.post_id
    posts = query_posts("p.id = %s", (post_id,))
    if not posts:
        return {"error": "Post not found"}, 404
    return posts_response(posts, {"type": "id", "id": post_id})


# ─── Vector / Semantic Search ────────────────────────────────────


@app.get("/posts/similar/<post_id>")
def similar_posts(path: PostIdPath):
    """Find posts similar to a given post using vector similarity."""
    post_id = path.post_id
    rows = query_all("""
        SELECT p.id, p.text, p.timestamp, 1 - (p.embedding <=> target.embedding) AS similarity
        FROM posts p, (SELECT embedding FROM posts WHERE id = %s) target
        WHERE p.embedding IS NOT NULL AND p.id != %s
        ORDER BY p.embedding <=> target.embedding
        LIMIT 10
    """, (post_id, post_id))
    for r in rows:
        r["ago"] = ago(r.get("timestamp"))
        r["timestamp"] = iso(r.get("timestamp"))
    return data_response(rows, {"type": "similar", "post_id": post_id})


@app.get("/posts/semantic-search")
def semantic_search():
    """Search posts by meaning using embeddings. Query param: q."""
    import urllib.request
    import json as _json

    q = request.args.get("q", "")
    if not q:
        return {"error": "'q' query param required"}, 400

    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    req = urllib.request.Request(
        f"{ollama_url}/api/embeddings",
        data=_json.dumps({"model": "nomic-embed-text", "prompt": q}).encode(),
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req, timeout=10)
    embedding = _json.loads(resp.read())["embedding"]
    vec_literal = "[" + ",".join(str(x) for x in embedding) + "]"

    rows = query_all("""
        SELECT p.id, p.text, p.timestamp, p.variety,
               1 - (p.embedding <=> %s::vector) AS similarity
        FROM posts p
        WHERE p.embedding IS NOT NULL AND p.text IS NOT NULL
        ORDER BY p.embedding <=> %s::vector
        LIMIT 20
    """, (vec_literal, vec_literal))
    for r in rows:
        r["ago"] = ago(r.get("timestamp"))
        r["timestamp"] = iso(r.get("timestamp"))
    return data_response(rows, {"type": "semantic_search", "q": q})


# ─── Engagement & Analytics ──────────────────────────────────────


@app.get("/stats/overview")
def stats_overview():
    """Total posts, date range, posts today/week/month."""
    now = utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    row = query_one("""
        SELECT
            COUNT(*) AS total,
            MIN(timestamp) AS first_post,
            MAX(timestamp) AS last_post,
            COUNT(*) FILTER (WHERE timestamp >= %s) AS today,
            COUNT(*) FILTER (WHERE timestamp >= %s) AS week,
            COUNT(*) FILTER (WHERE timestamp >= %s) AS month
        FROM posts
    """, (today_start, week_ago, month_ago))

    return data_response({
        "total_posts": row[0],
        "first_post": iso(row[1]),
        "last_post": iso(row[2]),
        "posts_today": row[3],
        "posts_this_week": row[4],
        "posts_this_month": row[5],
    }, {"type": "overview"})


@app.get("/stats/streak")
def stats_streak():
    """Current posting streak (consecutive days)."""
    rows = query_all("""
        SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day
        FROM posts
        GROUP BY day
        ORDER BY day DESC
    """)
    if not rows:
        return data_response({"streak_days": 0}, {"type": "streak"})

    streak = 0
    check_date = utcnow().date()
    for r in rows:
        d = r["day"]
        if d == check_date or d == check_date - timedelta(days=1):
            streak += 1
            check_date = d - timedelta(days=1)
        else:
            break

    return data_response({
        "streak_days": streak,
        "last_post_date": str(rows[0]["day"]),
    }, {"type": "streak"})


@app.get("/stats/top")
def stats_top():
    """Top N posts by metric. Query params: by (views|likes|replies, default views), n (default 10)."""
    by = request.args.get("by", "views")
    n = int(request.args.get("n", 10))
    METRIC_COLS = {"views": "m.views", "likes": "m.likes", "replies": "m.replies"}
    if by not in METRIC_COLS:
        return {"error": f"'by' must be one of {set(METRIC_COLS)}"}, 400

    metric_col = METRIC_COLS[by]
    posts = query_posts(
        f"{metric_col} IS NOT NULL",
        order=f"ORDER BY {metric_col} DESC NULLS LAST",
        limit=n,
    )
    return posts_response(posts, {"type": "top", "by": by, "n": n})


@app.get("/stats/top/today")
def stats_top_today():
    """Most engaged posts from today."""
    today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    posts = query_posts(
        "p.timestamp >= %s AND m.views IS NOT NULL",
        (today_start,),
        order="ORDER BY COALESCE(m.views, 0) DESC",
        limit=10,
    )
    return posts_response(posts, {"type": "top_today"})


@app.get("/stats/hourly")
def stats_hourly():
    """Posts per hour today."""
    today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = query_all("""
        SELECT EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour, COUNT(*) AS count
        FROM posts WHERE timestamp >= %s
        GROUP BY hour ORDER BY hour
    """, (today_start,))
    return data_response(rows, {"type": "hourly"})


@app.get("/stats/daily")
def stats_daily():
    """Posts per day this week."""
    week_ago = utcnow() - timedelta(days=7)
    rows = query_all("""
        SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
        FROM posts WHERE timestamp >= %s
        GROUP BY day ORDER BY day
    """, (week_ago,))
    for r in rows:
        r["day"] = str(r["day"])
    return data_response(rows, {"type": "daily"})


@app.get("/stats/tags")
def stats_tags():
    """Tag distribution with counts and percentages."""
    rows = query_all("""
        SELECT t.tag, COUNT(*) AS count
        FROM tags t
        WHERE t.is_primary = TRUE
        GROUP BY t.tag
        ORDER BY count DESC
    """)
    total = sum(r["count"] for r in rows) or 1
    for r in rows:
        r["percentage"] = round(r["count"] / total * 100, 1)
    return data_response(rows, {"type": "tags"})


@app.get("/stats/velocity")
def stats_velocity():
    """Posting rate (posts/day) over 7, 30, 90 days."""
    now = utcnow()
    since_7 = now - timedelta(days=7)
    since_30 = now - timedelta(days=30)
    since_90 = now - timedelta(days=90)
    row = query_one("""
        SELECT
            COUNT(*) FILTER (WHERE timestamp >= %s) AS c7,
            COUNT(*) FILTER (WHERE timestamp >= %s) AS c30,
            COUNT(*) FILTER (WHERE timestamp >= %s) AS c90
        FROM posts WHERE timestamp >= %s
    """, (since_7, since_30, since_90, since_90))
    result = {
        "last_7_days": round(row[0] / 7, 1),
        "last_30_days": round(row[1] / 30, 1),
        "last_90_days": round(row[2] / 90, 1),
    }
    return data_response(result, {"type": "velocity"})


# ─── Social / Relational ─────────────────────────────────────────


@app.get("/social/mentions")
def social_mentions():
    """Who I mention most (parsed from post text), top 20."""
    rows = query_all("""
        SELECT username, COUNT(*) AS mention_count FROM (
            SELECT unnest(regexp_matches(text, '@([a-zA-Z0-9_.]+)', 'g')) AS username
            FROM posts
            WHERE text IS NOT NULL
        ) mentions
        WHERE username != 'maybe_foucault'
        GROUP BY username
        ORDER BY mention_count DESC
        LIMIT 20
    """)
    return data_response(rows, {"type": "mentions"})


@app.get("/social/interactions")
def social_interactions():
    """Full interaction summary from conversations table."""
    rows = query_all("""
        SELECT reply_username, COUNT(*) AS reply_count
        FROM conversations
        WHERE reply_username IS NOT NULL
        GROUP BY reply_username
        ORDER BY reply_count DESC
        LIMIT 30
    """)
    return data_response(rows, {"type": "interactions"})


@app.get("/social/conversations/<post_id>")
def social_conversations(post_id):
    """Reply thread for a post."""
    rows = query_all("""
        SELECT reply_post_id, reply_username, reply_text,
               reply_timestamp, depth
        FROM conversations
        WHERE root_post_id = %s
        ORDER BY reply_timestamp
    """, (post_id,))
    for r in rows:
        r["ago"] = ago(r.get("reply_timestamp"))
        r["reply_timestamp"] = iso(r.get("reply_timestamp"))
    return data_response(rows, {"type": "conversation", "post_id": post_id})


# ─── Knowledge Graph ─────────────────────────────────────────────


@app.get("/graph/topics")
def graph_topics():
    """Tag clusters with connection strengths."""
    rows = query_all("""
        SELECT n.id, n.label, n.node_type, n.post_count, n.size,
               COALESCE(
                 json_agg(json_build_object(
                   'target', e.target, 'weight', e.weight, 'type', e.edge_type
                 )) FILTER (WHERE e.id IS NOT NULL), '[]'
               ) AS connections
        FROM kg_nodes n
        LEFT JOIN kg_edges e ON e.source = n.id
        WHERE n.node_type = 'tag'
        GROUP BY n.id, n.label, n.node_type, n.post_count, n.size
        ORDER BY n.post_count DESC NULLS LAST
    """)
    return data_response(rows, {"type": "topics"})


@app.get("/graph/related/<tag>")
def graph_related(path: TagPath):
    """Tags related to a given tag via knowledge graph edges."""
    tag = path.tag
    rows = query_all("""
        SELECT
            CASE WHEN e.source = %s THEN e.target ELSE e.source END AS related_tag,
            e.weight, e.edge_type
        FROM kg_edges e
        WHERE (e.source = %s OR e.target = %s)
        ORDER BY e.weight DESC NULLS LAST
        LIMIT 20
    """, (tag, tag, tag))
    return data_response(rows, {"type": "related", "tag": tag})


# ─── Digest / Summary ────────────────────────────────────────────


@app.get("/digest/today")
def digest_today():
    """Structured summary of today's activity."""
    today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Post count and variety breakdown
    summary = query_one("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE variety = 'original') AS originals,
               COUNT(*) FILTER (WHERE variety = 'reply') AS replies,
               COUNT(*) FILTER (WHERE variety = 'quote') AS quotes,
               COUNT(*) FILTER (WHERE variety = 'repost') AS reposts
        FROM posts WHERE timestamp >= %s
    """, (today_start,))

    # Top tags today
    top_tags = query_all("""
        SELECT t.tag, COUNT(*) AS count
        FROM tags t JOIN posts p ON p.id = t.post_id
        WHERE p.timestamp >= %s AND t.is_primary = TRUE
        GROUP BY t.tag ORDER BY count DESC LIMIT 5
    """, (today_start,))

    # Top post by views
    top_post = query_posts(
        "p.timestamp >= %s AND m.views IS NOT NULL",
        (today_start,),
        order="ORDER BY COALESCE(m.views, 0) DESC",
        limit=1,
    )

    return data_response({
        "date": str(utcnow().date()),
        "total_posts": summary[0],
        "originals": summary[1],
        "replies": summary[2],
        "quotes": summary[3],
        "reposts": summary[4],
        "top_tags": top_tags,
        "top_post": top_post[0] if top_post else None,
    }, {"type": "digest_today"})


@app.get("/digest/week")
def digest_week():
    """Weekly summary."""
    week_ago = utcnow() - timedelta(days=7)

    summary = query_one("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE variety = 'original') AS originals,
               COUNT(*) FILTER (WHERE variety = 'reply') AS replies
        FROM posts WHERE timestamp >= %s
    """, (week_ago,))

    top_tags = query_all("""
        SELECT t.tag, COUNT(*) AS count
        FROM tags t JOIN posts p ON p.id = t.post_id
        WHERE p.timestamp >= %s AND t.is_primary = TRUE
        GROUP BY t.tag ORDER BY count DESC LIMIT 5
    """, (week_ago,))

    daily = query_all("""
        SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
        FROM posts WHERE timestamp >= %s
        GROUP BY day ORDER BY day
    """, (week_ago,))
    for r in daily:
        r["day"] = str(r["day"])

    return data_response({
        "period": "last_7_days",
        "total_posts": summary[0],
        "originals": summary[1],
        "replies": summary[2],
        "top_tags": top_tags,
        "daily_breakdown": daily,
    }, {"type": "digest_week"})


@app.get("/digest/brief")
def digest_brief():
    """One-paragraph natural language summary for Apple Intelligence."""
    now = utcnow()
    day_ago = now - timedelta(hours=24)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    row = query_one("""
        SELECT COUNT(*) AS total,
               MIN(timestamp) AS first_ts,
               COUNT(*) FILTER (WHERE variety = 'original') AS originals,
               COUNT(*) FILTER (WHERE variety = 'reply') AS replies
        FROM posts WHERE timestamp >= %s
    """, (day_ago,))

    total, first_ts, originals, reps = row[0], row[1], row[2], row[3]

    top_tags = query_all("""
        SELECT t.tag, COUNT(*) AS count
        FROM tags t JOIN posts p ON p.id = t.post_id
        WHERE p.timestamp >= %s AND t.is_primary = TRUE
        GROUP BY t.tag ORDER BY count DESC LIMIT 3
    """, (day_ago,))
    tag_names = [r["tag"] for r in top_tags]

    # Top post by views in last 24h
    top_post = query_one("""
        SELECT COALESCE(m.views, 0) AS views
        FROM posts p LEFT JOIN metrics_latest m ON m.post_id = p.id
        WHERE p.timestamp >= %s
        ORDER BY COALESCE(m.views, 0) DESC LIMIT 1
    """, (day_ago,))
    top_views = top_post[0] if top_post else 0

    # Build the paragraph
    parts = []
    if total == 0:
        parts.append("No posts in the last 24 hours.")
    else:
        parts.append(f"In the last 24 hours you posted {total} time{'s' if total != 1 else ''}")
        if originals and reps:
            parts[-1] += f" ({originals} original{'s' if originals != 1 else ''}, {reps} repl{'ies' if reps != 1 else 'y'})"
        parts[-1] += "."

        if tag_names:
            if len(tag_names) == 1:
                parts.append(f"Mostly about {tag_names[0]}.")
            else:
                parts.append(f"Mostly about {', '.join(tag_names[:-1])} and {tag_names[-1]}.")

        if top_views > 0:
            parts.append(f"Your most viewed post got {top_views:,} views.")

        if first_ts:
            hour = first_ts.strftime("%-I%p").lower()
            parts.append(f"Active since {hour}.")

    brief = " ".join(parts)

    return data_response({"brief": brief}, {"type": "digest_brief"})


# ─── Haiku Oracle ────────────────────────────────────────────────


@app.get("/haiku/latest")
def haiku_latest():
    """Latest haiku with its source post graph."""
    row = query_one("""
        SELECT uuid, haiku, model, generated_at
        FROM haikus ORDER BY generated_at DESC LIMIT 1
    """)
    if not row:
        return data_response({"haiku": None}, {"type": "haiku_latest"})
    uuid = str(row[0])
    edges = query_all("""
        SELECT post_id, period, post_text, post_timestamp
        FROM haiku_edges WHERE haiku_uuid = %s
        ORDER BY post_timestamp
    """, (uuid,))
    for e in edges:
        if e.get("post_timestamp"):
            e["ago"] = ago(e["post_timestamp"])
            e["post_timestamp"] = iso(e["post_timestamp"])
    return data_response({
        "uuid": uuid,
        "haiku": row[1],
        "model": row[2],
        "generated_at": iso(row[3]) if row[3] else None,
        "sources": edges,
    }, {"type": "haiku_latest"})


@app.get("/haiku/all")
def haiku_all():
    """All haikus from the oracle with source counts."""
    rows = query_all("""
        SELECT h.uuid, h.haiku, h.model, h.generated_at,
               COUNT(e.id) AS source_count
        FROM haikus h
        LEFT JOIN haiku_edges e ON e.haiku_uuid = h.uuid
        GROUP BY h.uuid, h.haiku, h.model, h.generated_at
        ORDER BY h.generated_at DESC LIMIT 50
    """)
    for r in rows:
        r["uuid"] = str(r["uuid"])
        if r.get("generated_at"):
            r["generated_at"] = iso(r["generated_at"])
    return data_response(rows, {"type": "haiku_all"})


# ─── Enrichment & Insights ───────────────────────────────────────


@app.get("/vibe/now")
def vibe_now():
    """Today's vibe breakdown."""
    rows = query_all("""
        SELECT vibe, COUNT(*) as count
        FROM posts
        WHERE timestamp >= %s AND vibe IS NOT NULL
        GROUP BY vibe ORDER BY count DESC
    """, (utcnow().replace(hour=0, minute=0, second=0, microsecond=0),))
    # fallback to intent if no vibe tags yet
    if not rows:
        rows = query_all("""
            SELECT intent as vibe, COUNT(*) as count
            FROM posts
            WHERE timestamp >= %s AND intent IS NOT NULL
            GROUP BY intent ORDER BY count DESC
        """, (utcnow().replace(hour=0, minute=0, second=0, microsecond=0),))
    total = sum(r["count"] for r in rows)
    for r in rows:
        r["percentage"] = round(r["count"] / max(total, 1) * 100, 1)
    return data_response(rows, {"type": "vibe_now"})


@app.get("/mood")
def mood():
    """Current mood -- sentiment + energy from recent posts."""
    row = query_one("""
        SELECT
            ROUND(AVG(sentiment)::numeric, 2) as avg_sentiment,
            COUNT(*) FILTER (WHERE energy = 'high') as high_energy,
            COUNT(*) FILTER (WHERE energy = 'mid') as mid_energy,
            COUNT(*) FILTER (WHERE energy = 'low') as low_energy,
            COUNT(*) as total
        FROM posts
        WHERE timestamp >= NOW() - INTERVAL '24 hours' AND sentiment IS NOT NULL
    """)
    if not row or not row[4]:
        return data_response({"mood": "no recent data"}, {"type": "mood"})

    sent = float(row[0]) if row[0] else 0
    mood_word = "positive" if sent > 0.1 else "negative" if sent < -0.1 else "neutral"
    dominant_energy = "high" if row[1] >= row[2] and row[1] >= row[3] else "mid" if row[2] >= row[3] else "low"

    return data_response({
        "sentiment": sent,
        "mood": mood_word,
        "energy": dominant_energy,
        "breakdown": {"high": row[1], "mid": row[2], "low": row[3]},
        "posts_analyzed": row[4],
        "brief": f"Mood: {mood_word} ({sent:+.2f}), energy: {dominant_energy} ({row[4]} posts)"
    }, {"type": "mood"})


@app.get("/drift")
def drift():
    """Topic drift -- what you're posting more/less about vs last month."""
    rows = query_all("""
        WITH this_month AS (
            SELECT tag, COUNT(*) as cnt FROM tags t
            JOIN posts p ON p.id = t.post_id
            WHERE p.timestamp >= NOW() - INTERVAL '30 days' AND t.is_primary
            GROUP BY tag
        ), last_month AS (
            SELECT tag, COUNT(*) as cnt FROM tags t
            JOIN posts p ON p.id = t.post_id
            WHERE p.timestamp BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND t.is_primary
            GROUP BY tag
        )
        SELECT COALESCE(t.tag, l.tag) as tag,
               COALESCE(t.cnt, 0) as this_month,
               COALESCE(l.cnt, 0) as last_month,
               COALESCE(t.cnt, 0) - COALESCE(l.cnt, 0) as delta
        FROM this_month t
        FULL OUTER JOIN last_month l ON t.tag = l.tag
        ORDER BY ABS(COALESCE(t.cnt, 0) - COALESCE(l.cnt, 0)) DESC
        LIMIT 10
    """)
    return data_response(rows, {"type": "drift"})


@app.get("/bridges")
def bridges():
    """Posts that bridge different topic clusters -- semantically between two tags."""
    rows = query_all("""
        SELECT p.id, p.text, p.timestamp,
               array_agg(DISTINCT t.tag) as tags,
               COUNT(DISTINCT t.tag) as tag_count
        FROM posts p
        JOIN tags t ON t.post_id = p.id
        WHERE p.text IS NOT NULL
        GROUP BY p.id, p.text, p.timestamp
        HAVING COUNT(DISTINCT t.tag) >= 3
        ORDER BY COUNT(DISTINCT t.tag) DESC, p.timestamp DESC
        LIMIT 20
    """)
    for r in rows:
        r["ago"] = ago(r.get("timestamp"))
        r["timestamp"] = iso(r.get("timestamp"))
    return data_response(rows, {"type": "bridges"})


@app.get("/who-am-i")
def who_am_i():
    """Personality snapshot from the data -- all enrichments in one view."""
    # Top tags
    top_tags = query_all("""
        SELECT tag, COUNT(*) as count FROM tags WHERE is_primary
        GROUP BY tag ORDER BY count DESC LIMIT 5
    """)
    # Avg sentiment
    sentiment = query_one("""
        SELECT ROUND(AVG(sentiment)::numeric, 2),
               ROUND(STDDEV(sentiment)::numeric, 2)
        FROM posts WHERE sentiment IS NOT NULL
    """)
    # Vibe distribution (or intent as fallback)
    vibes = query_all("""
        SELECT COALESCE(vibe, intent) as vibe, COUNT(*) as count
        FROM posts WHERE COALESCE(vibe, intent) IS NOT NULL
        GROUP BY COALESCE(vibe, intent) ORDER BY count DESC LIMIT 7
    """)
    # Energy
    energy = query_all("""
        SELECT energy, COUNT(*) as count FROM posts
        WHERE energy IS NOT NULL GROUP BY energy ORDER BY count DESC
    """)
    # Posting pattern
    pattern = query_all("""
        SELECT hour_bucket, COUNT(*) as count FROM posts
        WHERE hour_bucket IS NOT NULL
        GROUP BY hour_bucket ORDER BY count DESC LIMIT 5
    """)
    # Top mentions
    mentions = query_all("""
        SELECT to_username, COUNT(*) as count FROM interactions
        GROUP BY to_username ORDER BY count DESC LIMIT 5
    """)
    # Total stats
    stats = query_one("""
        SELECT COUNT(*), MIN(timestamp), MAX(timestamp) FROM posts
    """)

    return data_response({
        "total_posts": stats[0] if stats else 0,
        "date_range": {"from": iso(stats[1]) if stats else None, "to": iso(stats[2]) if stats else None},
        "top_tags": top_tags,
        "sentiment": {"mean": float(sentiment[0]) if sentiment and sentiment[0] else None, "stddev": float(sentiment[1]) if sentiment and sentiment[1] else None},
        "vibes": vibes,
        "energy": energy,
        "peak_hours": pattern,
        "top_people": mentions,
    }, {"type": "who_am_i"})


# ─── Analysis Endpoints (parameterized) ─────────────────────────


@app.get("/analysis/sentiment")
def analysis_sentiment():
    """Sentiment over time. Query params: window (day|week|month), tag (optional)."""
    window = request.args.get("window", "week")
    tag = request.args.get("tag")
    bucket = {"day": "DATE(p.timestamp)", "week": "DATE_TRUNC('week', p.timestamp)", "month": "DATE_TRUNC('month', p.timestamp)"}
    b = bucket.get(window, bucket["week"])

    params = []
    where = "p.sentiment IS NOT NULL"
    if tag:
        where += " AND EXISTS (SELECT 1 FROM tags t WHERE t.post_id = p.id AND t.tag = %s)"
        params.append(tag)

    rows = query_all(f"""
        SELECT {b} as period,
               ROUND(AVG(p.sentiment)::numeric, 3) as avg_sentiment,
               COUNT(*) as post_count
        FROM posts p
        WHERE {where}
        GROUP BY period ORDER BY period DESC LIMIT 52
    """, tuple(params))
    for r in rows:
        r["period"] = iso(r["period"]) if r.get("period") else None
    return data_response(rows, {"type": "sentiment_timeline", "window": window, "tag": tag})


@app.get("/analysis/energy")
def analysis_energy():
    """Energy distribution. Query param: since (ISO date, optional)."""
    since = request.args.get("since")
    params = []
    where = "energy IS NOT NULL"
    if since:
        where += " AND timestamp >= %s"
        params.append(since)
    rows = query_all(f"""
        SELECT energy, COUNT(*) as count FROM posts
        WHERE {where} GROUP BY energy ORDER BY count DESC
    """, tuple(params))
    return data_response(rows, {"type": "energy", "since": since})


@app.get("/analysis/intent")
def analysis_intent():
    """Intent distribution. Query param: since (ISO date, optional)."""
    since = request.args.get("since")
    params = []
    where = "intent IS NOT NULL"
    if since:
        where += " AND timestamp >= %s"
        params.append(since)
    rows = query_all(f"""
        SELECT intent, COUNT(*) as count FROM posts
        WHERE {where} GROUP BY intent ORDER BY count DESC
    """, tuple(params))
    return data_response(rows, {"type": "intent", "since": since})


@app.get("/analysis/hours")
def analysis_hours():
    """Posting pattern by hour of day."""
    rows = query_all("""
        SELECT hour_bucket, COUNT(*) as count,
               ROUND(AVG(sentiment)::numeric, 2) as avg_sentiment
        FROM posts
        WHERE hour_bucket IS NOT NULL
        GROUP BY hour_bucket ORDER BY hour_bucket
    """)
    return data_response(rows, {"type": "hourly_pattern"})


@app.get("/analysis/language")
def analysis_language():
    """Language distribution across posts."""
    rows = query_all("""
        SELECT language, COUNT(*) as count FROM posts
        WHERE language IS NOT NULL
        GROUP BY language ORDER BY count DESC
    """)
    return data_response(rows, {"type": "language"})


# ─── Tech Genealogy ──────────────────────────────────────────────


@app.get("/genealogy/topics")
def genealogy_topics():
    """All tech topics with frequency and date range."""
    rows = query_all("""
        SELECT topic, COUNT(*) as mentions,
               MIN(timestamp) as first_mentioned,
               MAX(timestamp) as last_mentioned
        FROM tech_genealogy
        GROUP BY topic ORDER BY mentions DESC
    """)
    for r in rows:
        r["first_mentioned"] = iso(r.get("first_mentioned"))
        r["last_mentioned"] = iso(r.get("last_mentioned"))
    return data_response(rows, {"type": "genealogy_topics"})


@app.get("/genealogy/timeline")
def genealogy_timeline():
    """Tech topic timeline -- monthly topic frequencies. Query param: topic (optional)."""
    topic = request.args.get("topic")
    params = []
    where = ""
    if topic:
        where = "WHERE topic = %s"
        params.append(topic)
    rows = query_all(f"""
        SELECT DATE_TRUNC('month', timestamp) as month, topic, COUNT(*) as count
        FROM tech_genealogy {where}
        GROUP BY month, topic
        ORDER BY month, count DESC
    """, tuple(params))
    for r in rows:
        r["month"] = iso(r.get("month"))
    return data_response(rows, {"type": "genealogy_timeline", "topic": topic})


@app.get("/genealogy/connections")
def genealogy_connections():
    """Topic-to-topic connections (co-occurrence graph). Query param: topic (optional, filter to connections of that topic)."""
    topic = request.args.get("topic")
    params = []
    where = ""
    if topic:
        where = "WHERE source_topic = %s OR target_topic = %s"
        params = [topic, topic]
    rows = query_all(f"""
        SELECT source_topic, target_topic, co_occurrence_count,
               first_seen, last_seen
        FROM tech_genealogy_edges {where}
        ORDER BY co_occurrence_count DESC
        LIMIT 50
    """, tuple(params))
    for r in rows:
        r["first_seen"] = iso(r.get("first_seen"))
        r["last_seen"] = iso(r.get("last_seen"))
    return data_response(rows, {"type": "genealogy_connections", "topic": topic})


@app.get("/genealogy/evolution")
def genealogy_evolution():
    """How a specific topic evolved over time -- posts mentioning it chronologically."""
    topic = request.args.get("topic")
    if not topic:
        return {"error": "'topic' query param required"}, 400
    rows = query_all("""
        SELECT p.id, p.text, p.timestamp, p.variety
        FROM tech_genealogy g
        JOIN posts p ON p.id = g.post_id
        WHERE g.topic = %s
        ORDER BY p.timestamp
        LIMIT 100
    """, (topic,))
    for r in rows:
        r["ago"] = ago(r.get("timestamp"))
        r["timestamp"] = iso(r.get("timestamp"))
    return data_response(rows, {"type": "genealogy_evolution", "topic": topic})


@app.get("/genealogy/brief")
def genealogy_brief():
    """Natural language summary of tech journey."""
    rows = query_all("""
        SELECT topic, COUNT(*) as mentions,
               MIN(timestamp) as first_mentioned,
               MAX(timestamp) as last_mentioned
        FROM tech_genealogy
        GROUP BY topic ORDER BY mentions DESC LIMIT 10
    """)
    if not rows:
        return data_response({"brief": "No tech topics detected yet."}, {"type": "genealogy_brief"})

    top = rows[0]
    parts = [f"Top tech topic: {top['topic']} ({top['mentions']} mentions since {top['first_mentioned'].strftime('%b %Y')})."]

    # Recent additions (topics first seen in last 30 days)
    recent = query_all("""
        SELECT topic, MIN(timestamp) as first_seen, COUNT(*) as count
        FROM tech_genealogy
        GROUP BY topic
        HAVING MIN(timestamp) >= NOW() - INTERVAL '30 days'
        ORDER BY count DESC LIMIT 3
    """)
    if recent:
        names = [r["topic"] for r in recent]
        parts.append(f"New this month: {', '.join(names)}.")

    # Strongest connection
    edge = query_one("""
        SELECT source_topic, target_topic, co_occurrence_count
        FROM tech_genealogy_edges
        ORDER BY co_occurrence_count DESC LIMIT 1
    """)
    if edge:
        parts.append(f"Strongest connection: {edge[0]} <-> {edge[1]} ({edge[2]} co-occurrences).")

    return data_response({"brief": " ".join(parts), "top_topics": rows[:5]}, {"type": "genealogy_brief"})


# ─── Pedagogy Genealogy ─────────────────────────────────────────


@app.get("/pedagogy/topics")
def pedagogy_topics():
    """All pedagogy topics with frequency and date range."""
    rows = query_all("""
        SELECT topic, COUNT(*) as mentions,
               MIN(timestamp) as first_mentioned,
               MAX(timestamp) as last_mentioned
        FROM pedagogy_genealogy
        GROUP BY topic ORDER BY mentions DESC
    """)
    for r in rows:
        r["first_mentioned"] = iso(r.get("first_mentioned"))
        r["last_mentioned"] = iso(r.get("last_mentioned"))
    return data_response(rows, {"type": "pedagogy_topics"})


@app.get("/pedagogy/timeline")
def pedagogy_timeline():
    """Monthly pedagogy topic frequencies. Query param: topic (optional)."""
    topic = request.args.get("topic")
    params = []
    where = ""
    if topic:
        where = "WHERE topic = %s"
        params.append(topic)
    rows = query_all(f"""
        SELECT DATE_TRUNC('month', timestamp) as month, topic, COUNT(*) as count
        FROM pedagogy_genealogy {where}
        GROUP BY month, topic
        ORDER BY month, count DESC
    """, tuple(params))
    for r in rows:
        r["month"] = iso(r.get("month"))
    return data_response(rows, {"type": "pedagogy_timeline", "topic": topic})


@app.get("/pedagogy/connections")
def pedagogy_connections():
    """Pedagogy topic co-occurrence graph. Query param: topic (optional)."""
    topic = request.args.get("topic")
    params = []
    where = ""
    if topic:
        where = "WHERE source_topic = %s OR target_topic = %s"
        params = [topic, topic]
    rows = query_all(f"""
        SELECT source_topic, target_topic, co_occurrence_count,
               first_seen, last_seen
        FROM pedagogy_genealogy_edges {where}
        ORDER BY co_occurrence_count DESC LIMIT 50
    """, tuple(params))
    for r in rows:
        r["first_seen"] = iso(r.get("first_seen"))
        r["last_seen"] = iso(r.get("last_seen"))
    return data_response(rows, {"type": "pedagogy_connections", "topic": topic})


@app.get("/pedagogy/evolution")
def pedagogy_evolution():
    """How a pedagogy topic evolved over time. Query param: topic (required)."""
    topic = request.args.get("topic")
    if not topic:
        return {"error": "'topic' query param required"}, 400
    rows = query_all("""
        SELECT p.id, p.text, p.timestamp, p.variety
        FROM pedagogy_genealogy g
        JOIN posts p ON p.id = g.post_id
        WHERE g.topic = %s
        ORDER BY p.timestamp
        LIMIT 100
    """, (topic,))
    for r in rows:
        r["ago"] = ago(r.get("timestamp"))
        r["timestamp"] = iso(r.get("timestamp"))
    return data_response(rows, {"type": "pedagogy_evolution", "topic": topic})


@app.get("/pedagogy/brief")
def pedagogy_brief():
    """Natural language summary of pedagogical journey."""
    rows = query_all("""
        SELECT topic, COUNT(*) as mentions,
               MIN(timestamp) as first_mentioned
        FROM pedagogy_genealogy
        GROUP BY topic ORDER BY mentions DESC LIMIT 10
    """)
    if not rows:
        return data_response({"brief": "No pedagogy topics detected yet."}, {"type": "pedagogy_brief"})

    top = rows[0]
    total = query_one("SELECT COUNT(DISTINCT post_id) FROM pedagogy_genealogy")
    vector = query_one("SELECT COUNT(*) FROM pedagogy_genealogy WHERE topic = 'vector-discovered'")

    parts = [f"{total[0] if total else 0} pedagogical posts detected."]
    parts.append(f"Top method: {top['topic']} ({top['mentions']} mentions since {top['first_mentioned'].strftime('%b %Y')}).")
    if vector and vector[0]:
        parts.append(f"{vector[0]} additional posts found by semantic similarity.")

    recent = query_all("""
        SELECT topic, COUNT(*) as count FROM pedagogy_genealogy
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY topic ORDER BY count DESC LIMIT 3
    """)
    if recent:
        parts.append(f"This month focused on: {', '.join(r['topic'] for r in recent)}.")

    return data_response({"brief": " ".join(parts), "top_topics": rows[:5]}, {"type": "pedagogy_brief"})


@app.get("/pedagogy/vector-search")
def pedagogy_vector_search():
    """Find pedagogical posts by semantic similarity to a query. Query param: q."""
    q = request.args.get("q", "")
    if not q:
        return {"error": "'q' query param required"}, 400
    import urllib.request as ur, json as j
    req = ur.Request(
        os.environ.get("OLLAMA_URL", "http://localhost:11434") + "/api/embeddings",
        data=j.dumps({"model": "nomic-embed-text", "prompt": q}).encode(),
        headers={"Content-Type": "application/json"}
    )
    resp = ur.urlopen(req, timeout=10)
    emb = j.loads(resp.read())["embedding"]
    vec = "[" + ",".join(str(x) for x in emb) + "]"
    rows = query_all("""
        SELECT p.id, p.text, p.timestamp, p.variety,
               1 - (p.embedding <=> %s::vector) as similarity
        FROM posts p
        WHERE p.embedding IS NOT NULL AND p.text IS NOT NULL
        ORDER BY p.embedding <=> %s::vector
        LIMIT 20
    """, (vec, vec))
    for r in rows:
        r["ago"] = ago(r.get("timestamp"))
        r["timestamp"] = iso(r.get("timestamp"))
    return data_response(rows, {"type": "pedagogy_vector_search", "q": q})


# ─── Health check ─────────────────────────────────────────────────


@app.get("/health")
def health():
    """Health check."""
    try:
        query_one("SELECT 1")
        return {"status": "ok", "db": "connected", "generated_at": iso(utcnow())}
    except Exception as e:
        return {"status": "error", "db": str(e)}, 500


# ─── LLMs.txt (auto-generated from live routes) ─────────────────

LLMS_HEADER = """# Threads Analysis API

> API for querying ~50K Threads posts by @maybe_foucault. Postgres-backed, pgvector embeddings, Tailscale-accessible.

## Base URL
http://100.71.141.45:4323

## Authentication
None required (local network only via Tailscale)

## Response Format
All endpoints return JSON: { data, count, query, generated_at }

## Post Object Fields
id, text, timestamp, ago, variety (original|reply|quote|repost), tags[], primary_tag, surprise, word_count, permalink, metrics{views,likes,replies}, sentiment (-1 to 1), energy (low|mid|high), intent (statement|reaction|question|share|social|shitpost), language (en|de|vi|es)

## Tags (20 categories)
philosophy, tech, personal, reaction, one-liner, question, media, commentary, finance, meta-social, daily-life, work, food, url-share, sex-gender, race, language, political, creative, shitpost

"""

LLMS_MINI_HEADER = """# Threads API — http://100.71.141.45:4323

50K posts by @maybe_foucault. No auth. JSON responses. pgvector embeddings. 58+ endpoints.

"""


def _generate_llms_txt(mini=False):
    """Auto-generate llms.txt from live Flask routes."""
    lines = []
    if mini:
        lines.append(LLMS_MINI_HEADER)
    else:
        lines.append(LLMS_HEADER)
        lines.append("## Endpoints\n")

    # Group routes by prefix
    groups = {}
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        path = rule.rule
        if path in ("/static/<path:filename>",) or path.startswith("/docs"):
            continue
        methods = [m for m in rule.methods if m in ("GET", "POST")]
        if not methods:
            continue
        method = methods[0]
        # Get docstring
        func = app.view_functions.get(rule.endpoint)
        doc = (func.__doc__ or "").strip().split("\n")[0] if func else ""

        # Group by first path segment
        parts = path.strip("/").split("/")
        group = parts[0] if parts else "other"

        if group not in groups:
            groups[group] = []
        groups[group].append((method, path, doc))

    for group, routes in groups.items():
        if mini:
            for method, path, doc in routes:
                short_doc = doc[:60] if doc else ""
                lines.append(f"{path} — {short_doc}\n")
        else:
            lines.append(f"\n### {group.replace('-', ' ').title()}\n")
            for method, path, doc in routes:
                lines.append(f"- {method} `{path}` — {doc}\n")

    if not mini:
        lines.append("\n## Doc UIs\n")
        lines.append("- /docs/swagger — Swagger UI\n")
        lines.append("- /docs/redoc — ReDoc\n")
        lines.append("- /docs/rapidoc — RapiDoc\n")
        lines.append("- /docs/scalar — Scalar\n")
        lines.append("- /docs/elements — Stoplight Elements\n")
        lines.append("- /docs/rapipdf — PDF export\n")

    return "".join(lines)


@app.get("/llms.txt")
def llms_txt():
    """Full LLM instruction file — auto-generated from live routes."""
    return app.response_class(_generate_llms_txt(mini=False), mimetype="text/plain")


@app.get("/llms-mini.txt")
def llms_mini_txt():
    """Compact LLM instruction file — auto-generated from live routes."""
    return app.response_class(_generate_llms_txt(mini=True), mimetype="text/plain")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4323, debug=True)
