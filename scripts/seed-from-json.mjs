#!/usr/bin/env node
/**
 * Seed Postgres from static JSON analysis files.
 * Sources: public/data/post-tags.json, public/data/knowledge-graph.json
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://threads:threads_local_dev@localhost:5433/threads';

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const BATCH = 1000;
const USER_ID = '25703740162660740';
const USERNAME = 'maybe_foucault';

// Date range: July 2024 – Feb 2026
const START = new Date('2024-07-29T00:00:00Z').getTime();
const END = new Date('2026-02-22T23:59:59Z').getTime();

async function loadJSON(relPath) {
  const raw = await readFile(join(root, relPath), 'utf8');
  return JSON.parse(raw);
}

function fakeTimestamp(index, total) {
  const t = START + ((END - START) * index) / (total - 1 || 1);
  return new Date(t).toISOString();
}

function variety(post) {
  if (post.is_reply) return 'reply';
  if (post.is_quote) return 'quote';
  return 'original';
}

// ---------- batched insert helper ----------
async function batchInsert(client, sql, rows, label) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    // Build multi-row VALUES clause
    const { text, values } = buildMultiInsert(sql, batch);
    await client.query(text, values);
    inserted += batch.length;
    if (inserted % 5000 === 0 || i + BATCH >= rows.length) {
      console.log(`  ${label}: ${inserted} / ${rows.length}`);
    }
  }
  return inserted;
}

/**
 * sql.template: e.g. "INSERT INTO tags (post_id, tag, is_primary) VALUES"
 * sql.cols: number of columns per row
 * rows: array of arrays, each inner array = one row of values
 * sql.suffix: e.g. "ON CONFLICT DO NOTHING"
 */
function buildMultiInsert(sql, rows) {
  const placeholders = [];
  const values = [];
  let idx = 1;
  for (const row of rows) {
    const ph = row.map(() => `$${idx++}`);
    placeholders.push(`(${ph.join(',')})`);
    values.push(...row);
  }
  const text = `${sql.template} ${placeholders.join(',')} ${sql.suffix || ''}`;
  return { text, values };
}

// ---------- main ----------
async function main() {
  console.log('Loading JSON files...');
  const [postTags, kg] = await Promise.all([
    loadJSON('public/data/post-tags.json'),
    loadJSON('public/data/knowledge-graph.json'),
  ]);

  const posts = postTags.posts;
  console.log(`Loaded ${posts.length} posts, ${kg.nodes.length} nodes, ${kg.edges.length} edges`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. User
    await client.query(
      `INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [USER_ID, USERNAME]
    );
    console.log('Inserted user');

    // 2. Posts
    const postRows = posts.map((p, i) => [
      p.id,
      USER_ID,
      null, // text
      'TEXT_POST',
      fakeTimestamp(i, posts.length),
      p.is_quote || false,
      p.is_reply || false,
      variety(p),
      p.word_count || null,
    ]);
    await batchInsert(
      client,
      {
        template:
          'INSERT INTO posts (id, user_id, text, media_type, timestamp, is_quote_post, is_reply, variety, word_count) VALUES',
        suffix: 'ON CONFLICT (id) DO NOTHING',
      },
      postRows,
      'posts'
    );

    // 3. Tags
    const tagRows = [];
    for (const p of posts) {
      if (!p.tags) continue;
      for (const tag of p.tags) {
        tagRows.push([p.id, tag, tag === p.primary_tag]);
      }
    }
    await batchInsert(
      client,
      {
        template: 'INSERT INTO tags (post_id, tag, is_primary) VALUES',
        suffix: 'ON CONFLICT DO NOTHING',
      },
      tagRows,
      'tags'
    );

    // 4. Sub-tags
    const subTagRows = [];
    for (const p of posts) {
      if (!p.sub_tags || p.sub_tags.length === 0) continue;
      for (const st of p.sub_tags) {
        const parent = st.includes(':') ? st.split(':')[0] : p.primary_tag;
        subTagRows.push([p.id, st, parent]);
      }
    }
    await batchInsert(
      client,
      {
        template: 'INSERT INTO sub_tags (post_id, sub_tag, parent_tag) VALUES',
        suffix: 'ON CONFLICT DO NOTHING',
      },
      subTagRows,
      'sub_tags'
    );

    // 5. Surprise scores
    const surpriseRows = posts
      .filter((p) => p.surprise != null)
      .map((p) => [p.id, p.surprise, null]); // avg_surprise unknown
    await batchInsert(
      client,
      {
        template:
          'INSERT INTO surprise_scores (post_id, surprise, avg_surprise) VALUES',
        suffix: 'ON CONFLICT (post_id) DO NOTHING',
      },
      surpriseRows,
      'surprise_scores'
    );

    // 6. KG nodes
    const nodeRows = kg.nodes.map((n) => [
      n.id,
      n.label,
      n.type,
      n.post_count || null,
      n.size || null,
      n.color || null,
    ]);
    await batchInsert(
      client,
      {
        template:
          'INSERT INTO kg_nodes (id, label, node_type, post_count, size, color) VALUES',
        suffix: 'ON CONFLICT (id) DO NOTHING',
      },
      nodeRows,
      'kg_nodes'
    );

    // 7. KG edges
    const edgeRows = kg.edges.map((e) => [
      e.source,
      e.target,
      e.type,
      e.weight || null,
      e.count || null,
    ]);
    await batchInsert(
      client,
      {
        template:
          'INSERT INTO kg_edges (source, target, edge_type, weight, count) VALUES',
        suffix: 'ON CONFLICT DO NOTHING',
      },
      edgeRows,
      'kg_edges'
    );

    await client.query('COMMIT');
    console.log('\nCommitted. Checking row counts...\n');

    // Summary
    const tables = [
      'users',
      'posts',
      'tags',
      'sub_tags',
      'surprise_scores',
      'kg_nodes',
      'kg_edges',
    ];
    for (const t of tables) {
      const res = await client.query(`SELECT count(*) FROM ${t}`);
      console.log(`  ${t}: ${res.rows[0].count}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK — error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
