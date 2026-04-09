/**
 * db.mjs — PostgreSQL connection pool + upsert helpers
 */

import pg from 'pg';

let _pool;

function getPool() {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
    });
    _pool.on('error', (err) => {
      console.error('Unexpected PG pool error:', err.message);
    });
  }
  return _pool;
}

export async function query(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.log(`Slow query (${duration}ms): ${text.slice(0, 80)}...`);
  }
  return result;
}

export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── UPSERT HELPERS ─────────────────────────────────────────

export async function upsertPost(post, client) {
  const db = client || getPool();
  const isReply = post.is_reply === true;
  const isQuote = post.is_quote_post === true;
  const isRepost = post.media_type === 'REPOST_FACADE';
  const variety = isRepost ? 'repost' : isReply ? 'reply' : isQuote ? 'quote' : 'original';
  const text = post.text || null;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : null;
  const charCount = text ? text.length : null;
  const hasUrl = text ? /https?:\/\//.test(text) : false;
  const hasMedia = !!(post.media_url || post.thumbnail_url);

  const result = await db.query(`
    INSERT INTO posts (
      id, user_id, text, media_type, media_url, thumbnail_url,
      permalink, shortcode, timestamp, is_quote_post, is_reply, is_repost,
      variety, username, owner_id, char_count, word_count, has_url, has_media, raw_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (id) DO UPDATE SET
      text = COALESCE(EXCLUDED.text, posts.text),
      media_url = COALESCE(EXCLUDED.media_url, posts.media_url),
      thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, posts.thumbnail_url),
      permalink = COALESCE(EXCLUDED.permalink, posts.permalink),
      timestamp = EXCLUDED.timestamp,
      char_count = COALESCE(EXCLUDED.char_count, posts.char_count),
      word_count = COALESCE(EXCLUDED.word_count, posts.word_count),
      has_url = EXCLUDED.has_url,
      has_media = EXCLUDED.has_media,
      raw_json = EXCLUDED.raw_json,
      last_updated_at = NOW()
    RETURNING id
  `, [
    post.id,
    post.owner?.id || process.env.THREADS_USER_ID,
    text,
    post.media_type || 'TEXT_POST',
    post.media_url || null,
    post.thumbnail_url || null,
    post.permalink || null,
    post.shortcode || null,
    post.timestamp,
    isQuote,
    isReply,
    isRepost,
    variety,
    post.username || process.env.THREADS_USERNAME || null,
    post.owner?.id || null,
    charCount,
    wordCount,
    hasUrl,
    hasMedia,
    JSON.stringify(post),
  ]);
  return result.rows[0];
}

export async function insertMetrics(postId, metrics, client) {
  const db = client || getPool();
  if (!metrics || Object.keys(metrics).length === 0) return null;
  if (metrics._backfill_attempted && !metrics.views) return null;

  const result = await db.query(`
    INSERT INTO metrics (post_id, views, likes, replies, reposts, quotes, shares)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (post_id, fetched_at) DO NOTHING
    RETURNING id
  `, [
    postId,
    metrics.views ?? null,
    metrics.likes ?? null,
    metrics.replies ?? null,
    metrics.reposts ?? null,
    metrics.quotes ?? null,
    metrics.shares ?? null,
  ]);
  return result.rows[0] || null;
}

export async function upsertCarouselItems(postId, children, client) {
  const db = client || getPool();
  if (!children?.data?.length) return 0;

  const items = children.data;
  const placeholders = [];
  const params = [];
  for (let i = 0; i < items.length; i++) {
    const off = i * 7;
    placeholders.push(`($${off+1},$${off+2},$${off+3},$${off+4},$${off+5},$${off+6},$${off+7})`);
    params.push(
      items[i].id, postId, items[i].media_type || null,
      items[i].media_url || null, items[i].thumbnail_url || null,
      i, JSON.stringify(items[i])
    );
  }

  await db.query(`
    INSERT INTO carousel_items (id, post_id, media_type, media_url, thumbnail_url, position, raw_json)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (id) DO UPDATE SET
      media_url = COALESCE(EXCLUDED.media_url, carousel_items.media_url),
      thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, carousel_items.thumbnail_url)
  `, params);

  return items.length;
}

export async function upsertTags(postId, { tags, primaryTag, subTags }, client) {
  const db = client || getPool();
  await db.query('DELETE FROM tags WHERE post_id = $1', [postId]);
  await db.query('DELETE FROM sub_tags WHERE post_id = $1', [postId]);

  if (tags?.length) {
    const placeholders = [];
    const params = [postId];
    for (let i = 0; i < tags.length; i++) {
      params.push(tags[i], tags[i] === primaryTag);
      placeholders.push(`($1, $${i * 2 + 2}, $${i * 2 + 3})`);
    }
    await db.query(
      `INSERT INTO tags (post_id, tag, is_primary) VALUES ${placeholders.join(', ')}`,
      params
    );
  }

  if (subTags?.length) {
    const placeholders = [];
    const params = [postId];
    for (let i = 0; i < subTags.length; i++) {
      const parent = subTags[i].split(':')[0];
      params.push(subTags[i], parent);
      placeholders.push(`($1, $${i * 2 + 2}, $${i * 2 + 3})`);
    }
    await db.query(
      `INSERT INTO sub_tags (post_id, sub_tag, parent_tag) VALUES ${placeholders.join(', ')}`,
      params
    );
  }
}

export async function startSyncLog(syncType, client) {
  const db = client || getPool();
  const result = await db.query(
    `INSERT INTO sync_log (sync_type, status) VALUES ($1, 'running') RETURNING id`,
    [syncType]
  );
  return result.rows[0].id;
}

export async function updateSyncLog(logId, updates, client) {
  const db = client || getPool();
  await db.query(`
    UPDATE sync_log SET
      finished_at = NOW(),
      posts_fetched = $2,
      posts_new = $3,
      posts_updated = $4,
      metrics_fetched = $5,
      errors = $6,
      error_details = $7,
      status = $8
    WHERE id = $1
  `, [
    logId,
    updates.postsFetched || 0,
    updates.postsNew || 0,
    updates.postsUpdated || 0,
    updates.metricsFetched || 0,
    updates.errors || 0,
    updates.errorDetails ? JSON.stringify(updates.errorDetails) : null,
    updates.status || 'completed',
  ]);
}

export async function upsertConversation(rootPostId, reply, client) {
  const db = client || getPool();
  await db.query(`
    INSERT INTO conversations (root_post_id, reply_post_id, reply_username, reply_text, reply_timestamp, depth, raw_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (root_post_id, reply_post_id) DO UPDATE SET
      reply_text = COALESCE(EXCLUDED.reply_text, conversations.reply_text),
      raw_json = EXCLUDED.raw_json
  `, [
    rootPostId,
    reply.id,
    reply.username || null,
    reply.text || null,
    reply.timestamp || null,
    reply._depth || 1,
    JSON.stringify(reply),
  ]);
}

export async function getRecentOriginalPostIds(limit = 50, client) {
  const db = client || getPool();
  const result = await db.query(
    `SELECT id FROM posts WHERE variety = 'original' ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(r => r.id);
}

export async function refreshMetricsView(client) {
  const db = client || getPool();
  await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY metrics_latest');
}

export async function getLatestPostTimestamp(client) {
  const db = client || getPool();
  const result = await db.query('SELECT MAX(timestamp) as latest FROM posts');
  return result.rows[0]?.latest || null;
}

export async function close() {
  if (_pool) await _pool.end();
}
