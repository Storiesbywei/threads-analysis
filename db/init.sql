-- Threads Analysis — PostgreSQL Schema
-- Captures every field the Threads API can return

-- ─── ENUMS ────────────────────────────────────────────────

CREATE TYPE media_type AS ENUM (
  'TEXT_POST', 'IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'AUDIO', 'REPOST_FACADE'
);

CREATE TYPE post_variety AS ENUM (
  'original', 'reply', 'quote', 'repost'
);

-- ─── USERS ────────────────────────────────────────────────

CREATE TABLE users (
  id              TEXT PRIMARY KEY,           -- Threads user ID
  username        TEXT NOT NULL,
  first_synced_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POSTS ────────────────────────────────────────────────
-- Every post, reply, quote, and repost from the API

CREATE TABLE posts (
  id              TEXT PRIMARY KEY,           -- Threads media ID
  user_id         TEXT NOT NULL REFERENCES users(id),
  text            TEXT,                       -- Post body (max 500 chars)
  media_type      media_type NOT NULL DEFAULT 'TEXT_POST',
  media_url       TEXT,                       -- Image/video URL
  thumbnail_url   TEXT,                       -- Video thumbnail
  permalink       TEXT,                       -- Public threads.net URL
  shortcode       TEXT,                       -- URL short identifier
  timestamp       TIMESTAMPTZ NOT NULL,       -- Publication time (from API)
  is_quote_post   BOOLEAN DEFAULT FALSE,
  is_reply        BOOLEAN DEFAULT FALSE,
  is_repost       BOOLEAN DEFAULT FALSE,
  variety         post_variety NOT NULL DEFAULT 'original',
  username        TEXT,                       -- Author username at time of post
  owner_id        TEXT,                       -- Owner user ID (from API owner field)
  reply_to_id     TEXT,                       -- Parent post ID if reply
  quoted_post_id  TEXT,                       -- Quoted post ID if quote

  -- Text analysis (computed on ingest)
  char_count      INT,
  word_count      INT,
  has_url         BOOLEAN DEFAULT FALSE,
  has_media       BOOLEAN DEFAULT FALSE,

  -- Sync metadata
  raw_json        JSONB,                      -- Full API response preserved
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_reply_to FOREIGN KEY (reply_to_id) REFERENCES posts(id) ON DELETE SET NULL,
  CONSTRAINT fk_quoted   FOREIGN KEY (quoted_post_id) REFERENCES posts(id) ON DELETE SET NULL
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_timestamp ON posts(timestamp DESC);
CREATE INDEX idx_posts_media_type ON posts(media_type);
CREATE INDEX idx_posts_variety ON posts(variety);
CREATE INDEX idx_posts_is_reply ON posts(is_reply) WHERE is_reply = TRUE;
CREATE INDEX idx_posts_is_quote ON posts(is_quote_post) WHERE is_quote_post = TRUE;
CREATE INDEX idx_posts_text_search ON posts USING GIN (to_tsvector('english', COALESCE(text, '')));

-- ─── CAROUSEL CHILDREN ────────────────────────────────────
-- Media items within a CAROUSEL_ALBUM post

CREATE TABLE carousel_items (
  id              TEXT PRIMARY KEY,           -- Child media ID
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type      media_type,
  media_url       TEXT,
  thumbnail_url   TEXT,
  position        INT,                        -- Order in carousel
  raw_json        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_carousel_post ON carousel_items(post_id);

-- ─── METRICS (TIME SERIES) ────────────────────────────────
-- Engagement metrics snapshots — one row per post per sync
-- Allows tracking how metrics change over time

CREATE TABLE metrics (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  views           INT,
  likes           INT,
  replies         INT,
  reposts         INT,
  quotes          INT,
  shares          INT,

  UNIQUE (post_id, fetched_at)
);

CREATE INDEX idx_metrics_post ON metrics(post_id);
CREATE INDEX idx_metrics_fetched ON metrics(fetched_at DESC);

-- ─── METRICS LATEST (MATERIALIZED VIEW) ──────────────────
-- Quick access to most recent metrics per post

CREATE MATERIALIZED VIEW metrics_latest AS
  SELECT DISTINCT ON (post_id)
    post_id, fetched_at, views, likes, replies, reposts, quotes, shares
  FROM metrics
  ORDER BY post_id, fetched_at DESC;

CREATE UNIQUE INDEX idx_metrics_latest_post ON metrics_latest(post_id);

-- ─── TAGS ─────────────────────────────────────────────────
-- 20-tag taxonomy + 35 sub-tags from analysis pipeline

CREATE TABLE tags (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag             TEXT NOT NULL,              -- e.g. 'philosophy', 'tech'
  is_primary      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tags_post ON tags(post_id);
CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_tags_primary ON tags(post_id) WHERE is_primary = TRUE;

CREATE TABLE sub_tags (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  sub_tag         TEXT NOT NULL,              -- e.g. 'philosophy:continental'
  parent_tag      TEXT NOT NULL,              -- e.g. 'philosophy'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sub_tags_post ON sub_tags(post_id);
CREATE INDEX idx_sub_tags_sub ON sub_tags(sub_tag);
CREATE INDEX idx_sub_tags_parent ON sub_tags(parent_tag);

-- ─── SURPRISE SCORES ──────────────────────────────────────
-- Information-theoretic analysis per post

CREATE TABLE surprise_scores (
  post_id         TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  surprise        REAL,                       -- Total self-information (bits)
  avg_surprise    REAL,                       -- Average bits/word
  computed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── KNOWLEDGE GRAPH ──────────────────────────────────────

CREATE TABLE kg_nodes (
  id              TEXT PRIMARY KEY,           -- e.g. 'philosophy', 'concept:foucault', 'bridge:power'
  label           TEXT NOT NULL,
  node_type       TEXT NOT NULL,              -- 'tag', 'sub_tag', 'concept', 'bridge'
  post_count      INT,
  size            REAL,
  color           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kg_edges (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source          TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  target          TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  edge_type       TEXT NOT NULL,              -- 'co_occurrence', 'temporal', 'hierarchy', 'concept_link', 'bridge_link'
  weight          REAL,
  count           INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kg_edges_source ON kg_edges(source);
CREATE INDEX idx_kg_edges_target ON kg_edges(target);
CREATE INDEX idx_kg_edges_type ON kg_edges(edge_type);

-- ─── CONVERSATIONS ────────────────────────────────────────
-- Thread conversation trees (from /conversation endpoint)

CREATE TABLE conversations (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  root_post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reply_post_id   TEXT NOT NULL,              -- Other users' reply IDs (no FK — not in our posts table)
  reply_username  TEXT,
  reply_text      TEXT,
  reply_timestamp TIMESTAMPTZ,
  depth           INT DEFAULT 1,
  raw_json        JSONB,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (root_post_id, reply_post_id)
);

CREATE INDEX idx_conversations_root ON conversations(root_post_id);

-- ─── INTERACTIONS ────────────────────────────────────────
-- @mention interaction graph extracted from post text

CREATE TABLE interactions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  from_username   TEXT NOT NULL,
  to_username     TEXT NOT NULL,
  interaction_type TEXT NOT NULL,           -- 'reply_to', 'mention', 'quoted_by', 'commented_on'
  post_text       TEXT,
  timestamp       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (post_id, from_username, to_username, interaction_type)
);

CREATE INDEX idx_interactions_from ON interactions(from_username);
CREATE INDEX idx_interactions_to ON interactions(to_username);
CREATE INDEX idx_interactions_type ON interactions(interaction_type);

-- ─── HAIKU ORACLE (GRAPH) ────────────────────────────────
-- Output nodes + edges to source posts

CREATE TABLE haikus (
  uuid            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  haiku           TEXT NOT NULL,
  model           TEXT NOT NULL,
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE haiku_edges (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  haiku_uuid      UUID NOT NULL REFERENCES haikus(uuid) ON DELETE CASCADE,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  period          TEXT,
  post_text       TEXT,
  post_timestamp  TIMESTAMPTZ,
  edge_type       TEXT DEFAULT 'source',

  UNIQUE (haiku_uuid, post_id)
);

CREATE INDEX idx_haiku_edges_uuid ON haiku_edges(haiku_uuid);
CREATE INDEX idx_haiku_edges_post ON haiku_edges(post_id);

-- ─── SYNC LOG ─────────────────────────────────────────────
-- Track every sync run

CREATE TABLE sync_log (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  sync_type       TEXT NOT NULL,              -- 'full', 'incremental', 'metrics', 'replies', 'conversations'
  posts_fetched   INT DEFAULT 0,
  posts_new       INT DEFAULT 0,
  posts_updated   INT DEFAULT 0,
  metrics_fetched INT DEFAULT 0,
  errors          INT DEFAULT 0,
  error_details   JSONB,
  status          TEXT DEFAULT 'running'      -- 'running', 'completed', 'failed'
);

-- ─── TOKEN MANAGEMENT ─────────────────────────────────────

CREATE TABLE tokens (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash      TEXT NOT NULL,              -- SHA256 of token (never store raw in DB)
  token_type      TEXT NOT NULL DEFAULT 'long_lived',
  issued_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  refreshed_at    TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CORPUS STATS (SNAPSHOT) ──────────────────────────────
-- Periodic snapshots of corpus-level analysis

CREATE TABLE corpus_snapshots (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  total_posts     INT,
  total_words     INT,
  vocabulary_size INT,
  char_entropy    REAL,
  word_entropy    REAL,
  bigram_entropy  REAL,
  conditional_entropy REAL,
  zipf_exponent   REAL,
  tag_entropy     REAL,
  heaps_exponent  REAL,
  topic_stay_rate REAL,
  burst_rate      REAL,
  tag_distribution JSONB,
  sub_tag_distribution JSONB,
  category_entropies JSONB
);

-- ─── HELPER FUNCTIONS ─────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_metrics_latest()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY metrics_latest;
END;
$$ LANGUAGE plpgsql;

-- ─── SEED THE USER ────────────────────────────────────────
-- User is seeded by the sync worker on first run using THREADS_USER_ID env var
