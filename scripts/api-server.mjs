/**
 * api-server.mjs — Comprehensive REST API for the Threads Analysis corpus.
 *
 * Bind: 0.0.0.0:4322  (Tailscale-accessible, iOS Shortcuts friendly)
 * Deps: node built-ins + pg (already in package.json)
 *
 * Usage:  node scripts/api-server.mjs
 *         npm run api
 */

import http from 'node:http';
import { URL } from 'node:url';
import pg from 'pg';

// ─── CONFIG ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '4322', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://threads:threads_local_dev@localhost:5433/threads';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const APFEL_URL = process.env.APFEL_URL || 'http://localhost:11435';

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});
pool.on('error', (err) => console.error('[pg pool]', err.message));

// ─── HELPERS ─────────────────────────────────────────────────────────

function qs(url) {
  const params = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;
  return params;
}

function ok(data, meta) {
  return JSON.stringify({ ok: true, data, meta: meta || undefined });
}

function fail(msg, status = 400) {
  return { body: JSON.stringify({ ok: false, error: msg }), status };
}

function json(res, body, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Access-Control-Allow-Origin': '*' });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (err) {
    if (err instanceof SyntaxError) {
      const e = new Error('Invalid JSON in request body');
      e.statusCode = 400;
      throw e;
    }
    throw err;
  }
}

function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ─── COSINE SIMILARITY ──────────────────────────────────────────────

function cosine(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── OLLAMA HELPERS ──────────────────────────────────────────────────

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed error: ${res.status}`);
  const j = await res.json();
  return j.embedding;
}

async function ollamaGenerate(prompt, system, model = 'gemma4:e4b') {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama generate error: ${res.status}`);
  const j = await res.json();
  return j.response;
}

// ─── APFEL (APPLE INTELLIGENCE) HELPERS ─────────────────────────────

async function checkApfel() {
  try {
    const r = await fetch(`${APFEL_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

async function askApfel(question, context) {
  const res = await fetch(`${APFEL_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'apple-on-device',
      messages: [
        { role: 'system', content: 'You are an assistant answering questions about a Threads social media corpus of ~38,000 posts by @maybe_foucault. Use the provided context posts to answer. Be concise.' },
        { role: 'user', content: `Context posts:\n${context}\n\nQuestion: ${question}` }
      ],
      max_tokens: 512,
    }),
  });
  if (!res.ok) throw new Error(`Apfel error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response from Apple Intelligence';
}

async function checkOllama() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { available: false, models: [] };
    const data = await r.json();
    const names = (data.models || []).map((m) => m.name);
    return { available: true, models: names };
  } catch { return { available: false, models: [] }; }
}

// ─── ROUTE TABLE ─────────────────────────────────────────────────────

const routes = [];

function route(method, pattern, handler) {
  // Convert /api/posts/:id to a regex with named groups
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, re, keys, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method && r.method !== '*') continue;
    const m = pathname.match(r.re);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

// ─── UTILITY ─────────────────────────────────────────────────────────

route('GET', '/', (req, res) => redirect(res, '/api/openapi.json'));

route('GET', '/api/health', async (req, res) => {
  try {
    const [dbResult, ollamaStatus, apfelStatus] = await Promise.all([
      pool.query('SELECT NOW() AS ts, COUNT(*)::int AS posts FROM posts').then(
        (r) => ({ connected: true, posts: r.rows[0].posts }),
        (err) => ({ connected: false, error: err.message }),
      ),
      checkOllama(),
      checkApfel(),
    ]);
    json(res, ok({
      status: dbResult.connected ? 'ok' : 'degraded',
      db: dbResult,
      ollama: ollamaStatus,
      apfel: { available: apfelStatus },
    }));
  } catch (err) {
    json(res, fail('health check failed: ' + err.message, 503), 503);
  }
});

route('GET', '/api/openapi.json', (req, res) => {
  json(res, OPENAPI_SPEC);
});

// ─── POSTS ───────────────────────────────────────────────────────────

route('GET', '/api/posts', async (req, res, query) => {
  const page = int(query.page, 1);
  const limit = clamp(int(query.limit, 20), 1, 100);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  let idx = 1;

  if (query.tag) {
    where.push(`p.id IN (SELECT post_id FROM tags WHERE tag = $${idx})`);
    params.push(query.tag);
    idx++;
  }
  if (query.variety) {
    where.push(`p.variety = $${idx}`);
    params.push(query.variety);
    idx++;
  }
  if (query.from) {
    where.push(`p.timestamp >= $${idx}`);
    params.push(query.from);
    idx++;
  }
  if (query.to) {
    where.push(`p.timestamp <= $${idx}`);
    params.push(query.to);
    idx++;
  }
  if (query.q) {
    where.push(`to_tsvector('english', COALESCE(p.text,'')) @@ plainto_tsquery('english', $${idx})`);
    params.push(query.q);
    idx++;
  }
  if (query.has_media === 'true') {
    where.push(`p.has_media = true`);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countQ = await pool.query(
    `SELECT COUNT(*)::int AS total FROM posts p ${whereClause}`,
    params,
  );
  const total = countQ.rows[0].total;

  const dataQ = await pool.query(
    `SELECT p.id, p.text, p.media_type, p.permalink, p.timestamp, p.variety,
            p.word_count, p.char_count, p.username
     FROM posts p ${whereClause}
     ORDER BY p.timestamp DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );

  json(res, ok(dataQ.rows, { count: dataQ.rows.length, page, limit, total }));
});

route('GET', '/api/posts/recent', async (req, res, query) => {
  const limit = clamp(int(query.limit, 10), 1, 100);
  const { rows } = await pool.query(
    `SELECT p.id, p.text, p.media_type, p.permalink, p.timestamp, p.variety,
            p.word_count, p.char_count
     FROM posts p
     ORDER BY p.timestamp DESC
     LIMIT $1`,
    [limit],
  );
  json(res, ok(rows, { count: rows.length }));
});

route('GET', '/api/posts/search', async (req, res, query) => {
  const q = query.q || '';
  if (!q) return json(res, fail('q parameter required'), 400);

  const limit = clamp(int(query.limit, 20), 1, 100);
  const page = int(query.page, 1);
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `SELECT p.id, p.text, p.permalink, p.timestamp, p.variety, p.word_count,
            ts_rank(to_tsvector('english', COALESCE(p.text,'')),
                    plainto_tsquery('english', $1)) AS rank
     FROM posts p
     WHERE to_tsvector('english', COALESCE(p.text,'')) @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC, p.timestamp DESC
     LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );

  const countQ = await pool.query(
    `SELECT COUNT(*)::int AS total FROM posts p
     WHERE to_tsvector('english', COALESCE(p.text,'')) @@ plainto_tsquery('english', $1)`,
    [q],
  );

  json(res, ok(rows, { count: rows.length, page, limit, total: countQ.rows[0].total, query: q }));
});

route('GET', '/api/posts/random', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, text, permalink, timestamp, variety, word_count
     FROM posts
     WHERE text IS NOT NULL AND text != ''
     ORDER BY RANDOM()
     LIMIT 1`,
  );
  json(res, ok(rows[0] || null));
});

route('GET', '/api/posts/today', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, text, permalink, timestamp, variety, word_count
     FROM posts
     WHERE timestamp >= CURRENT_DATE
     ORDER BY timestamp DESC`,
  );
  json(res, ok(rows, { count: rows.length }));
});

route('GET', '/api/posts/stats', async (req, res) => {
  const [total, byVariety, byTag, dateRange, textStats] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM posts'),
    pool.query(`SELECT variety, COUNT(*)::int AS count FROM posts GROUP BY variety ORDER BY count DESC`),
    pool.query(`SELECT tag, COUNT(*)::int AS count FROM tags GROUP BY tag ORDER BY count DESC`),
    pool.query(`SELECT MIN(timestamp) AS earliest, MAX(timestamp) AS latest FROM posts`),
    pool.query(
      `SELECT COUNT(*)::int AS with_text,
              ROUND(AVG(word_count))::int AS avg_words,
              MAX(word_count)::int AS max_words,
              SUM(word_count)::int AS total_words
       FROM posts WHERE text IS NOT NULL AND text != ''`,
    ),
  ]);

  json(
    res,
    ok({
      total: total.rows[0].total,
      by_variety: byVariety.rows,
      by_tag: byTag.rows,
      date_range: dateRange.rows[0],
      text_stats: textStats.rows[0],
    }),
  );
});

route('GET', '/api/posts/:id', async (req, res, query, params) => {
  const { rows: posts } = await pool.query(
    `SELECT p.*, ml.views, ml.likes, ml.replies AS metric_replies, ml.reposts AS metric_reposts,
            ml.quotes AS metric_quotes, ml.shares
     FROM posts p
     LEFT JOIN metrics_latest ml ON ml.post_id = p.id
     WHERE p.id = $1`,
    [params.id],
  );
  if (!posts.length) return json(res, fail('Post not found', 404), 404);

  const [{ rows: tagRows }, { rows: subTagRows }, { rows: surprise }] = await Promise.all([
    pool.query('SELECT tag, is_primary FROM tags WHERE post_id = $1 ORDER BY is_primary DESC', [params.id]),
    pool.query('SELECT sub_tag, parent_tag FROM sub_tags WHERE post_id = $1', [params.id]),
    pool.query('SELECT surprise, avg_surprise FROM surprise_scores WHERE post_id = $1', [params.id]),
  ]);

  const post = posts[0];
  post.tags = tagRows;
  post.sub_tags = subTagRows;
  post.surprise = surprise[0] || null;
  delete post.raw_json; // strip bulk field

  json(res, ok(post));
});

// ─── METRICS & ANALYTICS ────────────────────────────────────────────

route('GET', '/api/metrics/top', async (req, res, query) => {
  const allowed = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];
  const by = allowed.includes(query.by) ? query.by : 'views';
  const limit = clamp(int(query.limit, 20), 1, 100);

  const { rows } = await pool.query(
    `SELECT p.id, p.text, p.permalink, p.timestamp, p.variety,
            ml.views, ml.likes, ml.replies, ml.reposts, ml.quotes, ml.shares
     FROM metrics_latest ml
     JOIN posts p ON p.id = ml.post_id
     WHERE ml.${by} IS NOT NULL
     ORDER BY ml.${by} DESC
     LIMIT $1`,
    [limit],
  );
  json(res, ok(rows, { count: rows.length, sorted_by: by }));
});

route('GET', '/api/metrics/summary', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS posts_with_metrics,
       SUM(views)::bigint AS total_views,
       SUM(likes)::bigint AS total_likes,
       SUM(replies)::bigint AS total_replies,
       SUM(reposts)::bigint AS total_reposts,
       SUM(quotes)::bigint AS total_quotes,
       SUM(shares)::bigint AS total_shares,
       ROUND(AVG(views))::int AS avg_views,
       ROUND(AVG(likes))::int AS avg_likes,
       MAX(views)::int AS max_views,
       MAX(likes)::int AS max_likes
     FROM metrics_latest`,
  );
  json(res, ok(rows[0]));
});

route('GET', '/api/metrics/daily', async (req, res, query) => {
  const days = clamp(int(query.days, 90), 1, 365);
  const { rows } = await pool.query(
    `SELECT
       date_trunc('day', p.timestamp)::date AS day,
       COUNT(*)::int AS posts,
       SUM(ml.views)::bigint AS views,
       SUM(ml.likes)::bigint AS likes,
       SUM(ml.replies)::bigint AS replies
     FROM posts p
     LEFT JOIN metrics_latest ml ON ml.post_id = p.id
     WHERE p.timestamp >= NOW() - ($1 || ' days')::interval
     GROUP BY day
     ORDER BY day DESC`,
    [days.toString()],
  );
  json(res, ok(rows, { count: rows.length, days }));
});

route('GET', '/api/metrics/by-tag', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       t.tag,
       COUNT(DISTINCT t.post_id)::int AS posts,
       COALESCE(SUM(ml.views), 0)::bigint AS total_views,
       COALESCE(SUM(ml.likes), 0)::bigint AS total_likes,
       ROUND(AVG(ml.views))::int AS avg_views,
       ROUND(AVG(ml.likes))::int AS avg_likes
     FROM tags t
     LEFT JOIN metrics_latest ml ON ml.post_id = t.post_id
     WHERE t.is_primary = TRUE
     GROUP BY t.tag
     ORDER BY total_views DESC`,
  );
  json(res, ok(rows, { count: rows.length }));
});

// ─── TAGS & TAXONOMY ────────────────────────────────────────────────

route('GET', '/api/tags', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT tag, COUNT(*)::int AS count
     FROM tags
     GROUP BY tag
     ORDER BY count DESC`,
  );
  json(res, ok(rows, { count: rows.length }));
});

route('GET', '/api/tags/cloud', async (req, res) => {
  const { rows: total } = await pool.query(
    'SELECT COUNT(DISTINCT post_id)::int AS total FROM tags',
  );
  const { rows } = await pool.query(
    `SELECT tag AS name, COUNT(*)::int AS count,
            ROUND(COUNT(*)::numeric / $1 * 100, 2)::float AS percentage
     FROM tags
     GROUP BY tag
     ORDER BY count DESC`,
    [total[0].total || 1],
  );
  json(res, ok(rows, { count: rows.length, total_tagged_posts: total[0].total }));
});

route('GET', '/api/tags/:tag/subtags', async (req, res, query, params) => {
  const { rows } = await pool.query(
    `SELECT sub_tag, COUNT(*)::int AS count
     FROM sub_tags
     WHERE parent_tag = $1
     GROUP BY sub_tag
     ORDER BY count DESC`,
    [params.tag],
  );
  json(res, ok(rows, { count: rows.length, parent: params.tag }));
});

route('GET', '/api/tags/:tag', async (req, res, query, params) => {
  const limit = clamp(int(query.limit, 20), 1, 100);
  const page = int(query.page, 1);
  const offset = (page - 1) * limit;

  const countQ = await pool.query(
    'SELECT COUNT(*)::int AS total FROM tags WHERE tag = $1',
    [params.tag],
  );

  const { rows } = await pool.query(
    `SELECT p.id, p.text, p.permalink, p.timestamp, p.variety, p.word_count
     FROM tags t
     JOIN posts p ON p.id = t.post_id
     WHERE t.tag = $1
     ORDER BY p.timestamp DESC
     LIMIT $2 OFFSET $3`,
    [params.tag, limit, offset],
  );

  json(res, ok(rows, { count: rows.length, page, limit, total: countQ.rows[0].total, tag: params.tag }));
});

// ─── KNOWLEDGE GRAPH ────────────────────────────────────────────────

route('GET', '/api/graph/nodes', async (req, res, query) => {
  const where = query.type ? 'WHERE node_type = $1' : '';
  const params = query.type ? [query.type] : [];
  const { rows } = await pool.query(
    `SELECT id, label, node_type, post_count, size, color FROM kg_nodes ${where} ORDER BY post_count DESC NULLS LAST`,
    params,
  );
  json(res, ok(rows, { count: rows.length }));
});

route('GET', '/api/graph/edges', async (req, res, query) => {
  const where = query.type ? 'WHERE edge_type = $1' : '';
  const params = query.type ? [query.type] : [];
  const limit = clamp(int(query.limit, 500), 1, 5000);
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT source, target, edge_type, weight, count FROM kg_edges ${where} ORDER BY weight DESC NULLS LAST LIMIT $${params.length}`,
    params,
  );
  json(res, ok(rows, { count: rows.length }));
});

route('GET', '/api/graph/neighbors/:nodeId', async (req, res, query, params) => {
  const { rows } = await pool.query(
    `SELECT
       CASE WHEN source = $1 THEN target ELSE source END AS neighbor,
       edge_type, weight, count
     FROM kg_edges
     WHERE source = $1 OR target = $1
     ORDER BY weight DESC NULLS LAST`,
    [params.nodeId],
  );
  json(res, ok(rows, { count: rows.length, node: params.nodeId }));
});

// ─── ANALYSIS ───────────────────────────────────────────────────────

route('GET', '/api/analysis/surprise', async (req, res, query) => {
  const above = parseFloat(query.above) || 5;
  const limit = clamp(int(query.limit, 20), 1, 100);
  const { rows } = await pool.query(
    `SELECT s.post_id, s.surprise, s.avg_surprise,
            p.text, p.permalink, p.timestamp, p.variety
     FROM surprise_scores s
     JOIN posts p ON p.id = s.post_id
     WHERE s.avg_surprise >= $1
     ORDER BY s.avg_surprise DESC
     LIMIT $2`,
    [above, limit],
  );
  json(res, ok(rows, { count: rows.length, threshold: above }));
});

route('GET', '/api/analysis/entropy', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM corpus_snapshots ORDER BY computed_at DESC LIMIT 1`,
  );
  if (!rows.length) {
    // Compute basic stats on-the-fly
    const ss = await pool.query(
      `SELECT
         COUNT(*)::int AS posts_scored,
         ROUND(AVG(avg_surprise)::numeric, 4)::float AS mean_surprise,
         ROUND(STDDEV(avg_surprise)::numeric, 4)::float AS stddev_surprise,
         ROUND(MIN(avg_surprise)::numeric, 4)::float AS min_surprise,
         ROUND(MAX(avg_surprise)::numeric, 4)::float AS max_surprise
       FROM surprise_scores`,
    );
    return json(res, ok({ source: 'computed', ...ss.rows[0] }));
  }
  json(res, ok(rows[0]));
});

route('GET', '/api/analysis/timeline', async (req, res, query) => {
  const bucket = query.bucket === 'week' ? 'week' : query.bucket === 'month' ? 'month' : 'day';
  const { rows } = await pool.query(
    `SELECT
       date_trunc($1, timestamp)::date AS period,
       COUNT(*)::int AS posts,
       COUNT(*) FILTER (WHERE variety = 'original')::int AS originals,
       COUNT(*) FILTER (WHERE variety = 'reply')::int AS replies,
       COUNT(*) FILTER (WHERE variety = 'quote')::int AS quotes,
       COUNT(*) FILTER (WHERE variety = 'repost')::int AS reposts,
       ROUND(AVG(word_count))::int AS avg_words
     FROM posts
     GROUP BY period
     ORDER BY period DESC`,
    [bucket],
  );
  json(res, ok(rows, { count: rows.length, bucket }));
});

// ─── RAG (OLLAMA) ───────────────────────────────────────────────────

const RAG_SYSTEM_PROMPT =
  'You are an assistant that answers questions about a Threads social media corpus from the account @maybe_foucault. ' +
  'Use the provided posts as context. Be concise and cite specific posts when relevant. ' +
  'If the context does not contain enough information, say so.';

async function getContextPosts(question) {
  const { rows: candidates } = await pool.query(
    `SELECT p.id, p.text, p.permalink, p.timestamp, p.variety,
            ts_rank(to_tsvector('english', COALESCE(p.text,'')),
                    plainto_tsquery('english', $1)) AS rank
     FROM posts p
     WHERE p.text IS NOT NULL AND p.text != ''
       AND to_tsvector('english', COALESCE(p.text,'')) @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT 50`,
    [question],
  );

  if (candidates.length === 0) {
    const { rows: recent } = await pool.query(
      `SELECT id, text, permalink, timestamp, variety
       FROM posts
       WHERE variety = 'original' AND text IS NOT NULL AND text != ''
       ORDER BY timestamp DESC
       LIMIT 10`,
    );
    return recent;
  }
  if (candidates.length <= 5) return candidates;

  // Re-rank with embeddings (concurrency-limited)
  const qEmbed = await ollamaEmbed(question);
  const CONCURRENCY = 10;
  const scored = [];
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const cEmbed = await ollamaEmbed(c.text.slice(0, 500));
          return { ...c, similarity: cosine(qEmbed, cEmbed) };
        } catch {
          return { ...c, similarity: c.rank || 0 };
        }
      }),
    );
    scored.push(...results);
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, 5);
}

function buildContextBlock(posts) {
  return posts
    .map(
      (p, i) =>
        `[${i + 1}] (${p.timestamp}) ${p.variety}: ${p.text?.slice(0, 400) || '(no text)'}${p.permalink ? '\n    ' + p.permalink : ''}`,
    )
    .join('\n\n');
}

function formatSources(posts) {
  return posts.map((p) => ({
    id: p.id,
    text: p.text?.slice(0, 200),
    permalink: p.permalink,
    timestamp: p.timestamp,
    similarity: p.similarity ?? null,
  }));
}

async function handleAsk(question, model = 'gemma4:e4b') {
  if (!question) throw new Error('question is required');

  const t0 = Date.now();
  const context = await getContextPosts(question);
  const contextBlock = buildContextBlock(context);
  const userPrompt = `Question: ${question}\n\nRelevant posts:\n${contextBlock}`;

  const answer = await ollamaGenerate(userPrompt, RAG_SYSTEM_PROMPT, model);

  return {
    answer,
    backend: model,
    latency_ms: Date.now() - t0,
    sources: formatSources(context),
  };
}

async function handleAskApfel(question) {
  if (!question) throw new Error('question is required');

  const t0 = Date.now();
  const context = await getContextPosts(question);
  const contextBlock = buildContextBlock(context);

  const answer = await askApfel(question, contextBlock);

  return {
    answer,
    backend: 'apfel',
    latency_ms: Date.now() - t0,
    sources: formatSources(context),
  };
}

async function handleAskAuto(question) {
  if (!question) throw new Error('question is required');

  const t0 = Date.now();
  const context = await getContextPosts(question);
  const contextBlock = buildContextBlock(context);

  let answer, backend;
  const apfelAvail = await checkApfel();
  if (apfelAvail) {
    try {
      answer = await askApfel(question, contextBlock);
      backend = 'apfel';
    } catch {
      // apfel responded to health but failed on generation — fall back
      answer = null;
    }
  }
  if (!answer) {
    const userPrompt = `Question: ${question}\n\nRelevant posts:\n${contextBlock}`;
    answer = await ollamaGenerate(userPrompt, RAG_SYSTEM_PROMPT, 'gemma4:e4b');
    backend = 'gemma4:e4b';
  }

  return {
    answer,
    backend,
    latency_ms: Date.now() - t0,
    sources: formatSources(context),
  };
}

route('POST', '/api/ask', async (req, res) => {
  try {
    const body = await readBody(req);
    const model = body.model === 'large' ? 'gemma4:26b' : 'gemma4:e4b';
    const result = await handleAsk(body.question, model);
    json(res, ok(result));
  } catch (err) {
    json(res, fail(err.message, 500), 500);
  }
});

route('GET', '/api/ask', async (req, res, query) => {
  try {
    const model = query.model === 'large' ? 'gemma4:26b' : 'gemma4:e4b';
    const result = await handleAsk(query.q, model);
    json(res, ok(result));
  } catch (err) {
    json(res, fail(err.message, 500), 500);
  }
});

// ─── APPLE INTELLIGENCE (APFEL) RAG ────────────────────────────────

route('POST', '/api/ask/apple', async (req, res) => {
  try {
    const body = await readBody(req);
    const result = await handleAskApfel(body.question);
    json(res, ok(result));
  } catch (err) {
    json(res, fail(err.message, 500), 500);
  }
});

route('GET', '/api/ask/apple', async (req, res, query) => {
  try {
    const result = await handleAskApfel(query.q);
    json(res, ok(result));
  } catch (err) {
    json(res, fail(err.message, 500), 500);
  }
});

// ─── AUTO RAG (APFEL → OLLAMA FALLBACK) ────────────────────────────

route('POST', '/api/ask/auto', async (req, res) => {
  try {
    const body = await readBody(req);
    const result = await handleAskAuto(body.question);
    json(res, ok(result));
  } catch (err) {
    json(res, fail(err.message, 500), 500);
  }
});

route('GET', '/api/ask/auto', async (req, res, query) => {
  try {
    const result = await handleAskAuto(query.q);
    json(res, ok(result));
  } catch (err) {
    json(res, fail(err.message, 500), 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  OPENAPI SPEC
// ═══════════════════════════════════════════════════════════════════════

const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Threads Analysis API',
    version: '1.0.0',
    description:
      'REST API for the @maybe_foucault Threads corpus — 45K+ posts, 20-tag taxonomy, engagement metrics, knowledge graph, and RAG-powered Q&A via Ollama.',
  },
  servers: [
    { url: 'http://100.71.141.45:4322', description: 'Tailscale (Mac mini)' },
    { url: 'http://localhost:4322', description: 'Local' },
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        tags: ['Utility'],
        responses: {
          200: {
            description: 'Server and database status',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
          },
        },
      },
    },
    '/api/openapi.json': {
      get: { summary: 'OpenAPI spec', tags: ['Utility'], responses: { 200: { description: 'This spec' } } },
    },
    '/api/posts': {
      get: {
        summary: 'List posts with pagination and filters',
        tags: ['Posts'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'Filter by tag name' },
          { name: 'variety', in: 'query', schema: { type: 'string', enum: ['original', 'reply', 'quote', 'repost'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Start date' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'End date' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text search query' },
          { name: 'has_media', in: 'query', schema: { type: 'string', enum: ['true'] }, description: 'Posts with media only' },
        ],
        responses: {
          200: {
            description: 'Paginated list of posts',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PostListResponse' } } },
          },
        },
      },
    },
    '/api/posts/recent': {
      get: {
        summary: 'Most recent posts (primary iOS Shortcut endpoint)',
        tags: ['Posts'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
        ],
        responses: { 200: { description: 'List of recent posts' } },
      },
    },
    '/api/posts/search': {
      get: {
        summary: 'Full-text search using Postgres GIN index',
        tags: ['Posts'],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: { 200: { description: 'Ranked search results' } },
      },
    },
    '/api/posts/random': {
      get: {
        summary: 'Random post with text',
        tags: ['Posts'],
        responses: { 200: { description: 'Single random post' } },
      },
    },
    '/api/posts/today': {
      get: {
        summary: 'Posts from today',
        tags: ['Posts'],
        responses: { 200: { description: 'Today\'s posts' } },
      },
    },
    '/api/posts/stats': {
      get: {
        summary: 'Aggregate corpus statistics',
        tags: ['Posts'],
        responses: { 200: { description: 'Total posts, breakdown by variety/tag, date range, text stats' } },
      },
    },
    '/api/posts/{id}': {
      get: {
        summary: 'Single post with metrics, tags, and surprise score',
        tags: ['Posts'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Full post details' },
          404: { description: 'Post not found' },
        },
      },
    },
    '/api/metrics/top': {
      get: {
        summary: 'Top posts by any metric',
        tags: ['Metrics'],
        parameters: [
          { name: 'by', in: 'query', schema: { type: 'string', enum: ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'], default: 'views' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Top posts sorted by metric' } },
      },
    },
    '/api/metrics/summary': {
      get: {
        summary: 'Aggregate metrics across all posts',
        tags: ['Metrics'],
        responses: { 200: { description: 'Total and average engagement metrics' } },
      },
    },
    '/api/metrics/daily': {
      get: {
        summary: 'Daily engagement over time',
        tags: ['Metrics'],
        parameters: [
          { name: 'days', in: 'query', schema: { type: 'integer', default: 90 } },
        ],
        responses: { 200: { description: 'Daily post counts and engagement' } },
      },
    },
    '/api/metrics/by-tag': {
      get: {
        summary: 'Engagement breakdown by primary tag',
        tags: ['Metrics'],
        responses: { 200: { description: 'Per-tag engagement stats' } },
      },
    },
    '/api/tags': {
      get: {
        summary: 'All tags with post counts',
        tags: ['Tags'],
        responses: { 200: { description: 'List of tags' } },
      },
    },
    '/api/tags/cloud': {
      get: {
        summary: 'Tag cloud data (name, count, percentage)',
        tags: ['Tags'],
        responses: { 200: { description: 'Tag cloud data' } },
      },
    },
    '/api/tags/{tag}': {
      get: {
        summary: 'Posts for a specific tag',
        tags: ['Tags'],
        parameters: [
          { name: 'tag', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: { 200: { description: 'Paginated posts for the tag' } },
      },
    },
    '/api/tags/{tag}/subtags': {
      get: {
        summary: 'Subtags within a tag',
        tags: ['Tags'],
        parameters: [
          { name: 'tag', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Subtag counts' } },
      },
    },
    '/api/graph/nodes': {
      get: {
        summary: 'Knowledge graph nodes',
        tags: ['Graph'],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['tag', 'sub_tag', 'concept', 'bridge'] } },
        ],
        responses: { 200: { description: 'List of graph nodes' } },
      },
    },
    '/api/graph/edges': {
      get: {
        summary: 'Knowledge graph edges',
        tags: ['Graph'],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 500, maximum: 5000 } },
        ],
        responses: { 200: { description: 'List of graph edges' } },
      },
    },
    '/api/graph/neighbors/{nodeId}': {
      get: {
        summary: 'Neighbors of a graph node',
        tags: ['Graph'],
        parameters: [
          { name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Connected nodes' } },
      },
    },
    '/api/analysis/surprise': {
      get: {
        summary: 'High-surprise posts',
        tags: ['Analysis'],
        parameters: [
          { name: 'above', in: 'query', schema: { type: 'number', default: 5 }, description: 'Minimum avg_surprise threshold' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Posts above surprise threshold' } },
      },
    },
    '/api/analysis/entropy': {
      get: {
        summary: 'Corpus entropy statistics',
        tags: ['Analysis'],
        responses: { 200: { description: 'Latest corpus snapshot or computed surprise stats' } },
      },
    },
    '/api/analysis/timeline': {
      get: {
        summary: 'Posting frequency over time',
        tags: ['Analysis'],
        parameters: [
          { name: 'bucket', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' } },
        ],
        responses: { 200: { description: 'Time-bucketed post counts by variety' } },
      },
    },
    '/api/ask': {
      get: {
        summary: 'RAG Q&A via Ollama (GET for iOS Shortcuts)',
        tags: ['RAG'],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Natural language question' },
          { name: 'model', in: 'query', schema: { type: 'string', enum: ['default', 'large'], default: 'default' }, description: 'Model size: default=gemma4:e4b, large=gemma4:26b' },
        ],
        responses: { 200: { description: 'AI-generated answer with source posts and backend metadata', content: { 'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } } } } },
      },
      post: {
        summary: 'RAG Q&A via Ollama (POST)',
        tags: ['RAG'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  question: { type: 'string', example: 'What did I post about AI last week?' },
                  model: { type: 'string', enum: ['default', 'large'], default: 'default' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'AI-generated answer with source posts', content: { 'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } } } } },
      },
    },
    '/api/ask/apple': {
      get: {
        summary: 'RAG Q&A via Apple Intelligence (apfel)',
        tags: ['RAG'],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Natural language question' },
        ],
        responses: { 200: { description: 'Answer from on-device Apple LLM', content: { 'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } } } } },
      },
      post: {
        summary: 'RAG Q&A via Apple Intelligence (POST)',
        tags: ['RAG'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: { question: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Answer from on-device Apple LLM', content: { 'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } } } } },
      },
    },
    '/api/ask/auto': {
      get: {
        summary: 'RAG Q&A with auto backend (apfel first, Ollama fallback)',
        tags: ['RAG'],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Natural language question' },
        ],
        responses: { 200: { description: 'Answer from best available backend', content: { 'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } } } } },
      },
      post: {
        summary: 'RAG Q&A with auto backend (POST)',
        tags: ['RAG'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: { question: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Answer from best available backend', content: { 'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } } } } },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'degraded'] },
              db: {
                type: 'object',
                properties: { connected: { type: 'boolean' }, posts: { type: 'integer' } },
              },
              ollama: {
                type: 'object',
                properties: { available: { type: 'boolean' }, models: { type: 'array', items: { type: 'string' } } },
              },
              apfel: {
                type: 'object',
                properties: { available: { type: 'boolean' } },
              },
            },
          },
        },
      },
      PostListResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                text: { type: 'string' },
                media_type: { type: 'string' },
                permalink: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                variety: { type: 'string', enum: ['original', 'reply', 'quote', 'repost'] },
                word_count: { type: 'integer' },
                char_count: { type: 'integer' },
              },
            },
          },
          meta: {
            type: 'object',
            properties: {
              count: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
      AskResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
              backend: { type: 'string', enum: ['gemma4:e4b', 'gemma4:26b', 'apfel'], description: 'Which LLM backend generated the answer' },
              latency_ms: { type: 'integer', description: 'Total request latency including retrieval and generation' },
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string' },
                    permalink: { type: 'string' },
                    timestamp: { type: 'string' },
                    similarity: { type: 'number', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════
//  SERVER
// ═══════════════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const query = qs(url);

  const match = matchRoute(req.method, pathname);
  if (!match) {
    return json(res, fail(`Not found: ${req.method} ${pathname}`, 404), 404);
  }

  try {
    await match.handler(req, res, query, match.params);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error(`[${req.method} ${pathname}]`, err);
    json(res, fail(err.message, status), status);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Threads API listening on http://${HOST}:${PORT}`);
  console.log(`  Tailscale: http://100.71.141.45:${PORT}`);
  console.log(`  OpenAPI:   http://localhost:${PORT}/api/openapi.json`);
  console.log(`  Health:    http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down...`);
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 5000);
  });
}
