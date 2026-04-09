-- threads-palace schema (tp_ prefix — coexists with threads-analysis tables)
-- Palace graph layer over HDBSCAN clusters for Gemma-routed topic navigation
--
-- Hierarchy:
--   wing    = cluster theme (e.g., "Philosophy & Power", "Tech Critique")
--   room    = sub-cluster or time period within a wing
--   drawer  = post reference (points to posts.id, ZERO content duplication)
--   tunnel  = cross-cluster edges (theme overlap, contradiction, evolution)

CREATE EXTENSION IF NOT EXISTS vector;

-- Palace topology nodes (structure only — NO content stored here)
CREATE TABLE IF NOT EXISTS tp_nodes (
    node_id    VARCHAR(255) PRIMARY KEY,
    node_type  VARCHAR(20)  NOT NULL CHECK (node_type IN ('wing','room','hall','drawer','tunnel','closet')),
    label      VARCHAR(255) NOT NULL,
    metadata   JSONB        NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Directed edges between palace nodes
CREATE TABLE IF NOT EXISTS tp_edges (
    edge_id      SERIAL       PRIMARY KEY,
    source_id    VARCHAR(255) NOT NULL REFERENCES tp_nodes(node_id) ON DELETE CASCADE,
    target_id    VARCHAR(255) NOT NULL REFERENCES tp_nodes(node_id) ON DELETE CASCADE,
    relationship VARCHAR(50)  NOT NULL,  -- contains | relates_to | references | contradicts | evolves_to
    weight       FLOAT        NOT NULL DEFAULT 1.0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, target_id, relationship)
);

-- Maps palace drawers to existing posts — ZERO content duplication
CREATE TABLE IF NOT EXISTS tp_drawer_refs (
    drawer_id       VARCHAR(255) NOT NULL REFERENCES tp_nodes(node_id) ON DELETE CASCADE,
    post_id         TEXT         NOT NULL,  -- FK to posts.id (cross-table, not enforced)
    relevance_score FLOAT        NOT NULL DEFAULT 1.0,
    PRIMARY KEY (drawer_id, post_id)
);

-- Agent memories stored in palace context (embeddings for semantic search)
CREATE TABLE IF NOT EXISTS tp_agent_memories (
    memory_id   VARCHAR(64)  PRIMARY KEY,
    content     TEXT         NOT NULL,
    embedding   vector(384),             -- all-minilm 384d (matches cluster embedding space)
    context     JSONB        NOT NULL DEFAULT '{}',
    tags        TEXT[]       NOT NULL DEFAULT '{}',
    drawer_id   VARCHAR(255) NOT NULL REFERENCES tp_nodes(node_id) ON DELETE CASCADE,
    agent_id    VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    accessed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- HNSW index for fast semantic search across agent memories
CREATE INDEX IF NOT EXISTS idx_tp_memories_hnsw
    ON tp_agent_memories USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_tp_nodes_type    ON tp_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_tp_edges_source  ON tp_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_tp_edges_target  ON tp_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_tp_memories_drawer ON tp_agent_memories(drawer_id);
CREATE INDEX IF NOT EXISTS idx_tp_memories_tags   ON tp_agent_memories USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_tp_memories_agent  ON tp_agent_memories(agent_id);
