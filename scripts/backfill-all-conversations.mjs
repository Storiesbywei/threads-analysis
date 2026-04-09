#!/usr/bin/env node
/**
 * backfill-all-conversations.mjs — Pull conversation threads for ALL posts
 *
 * Usage: node scripts/backfill-all-conversations.mjs [--delay=200] [--batch-size=5000] [--since=2025-01-01]
 *
 * Fetches GET /{post_id}/conversation for posts that don't yet have conversations backfilled.
 * Tracks which posts have been attempted via a _conversations_attempted marker in a tracking table.
 * Safe to interrupt and resume.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, fetchJSON, sleep, parseArgs, BASE, FIELDS } from './lib/threads-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const env = loadEnv(ROOT);
const TOKEN = env.THREADS_ACCESS_TOKEN || process.env.THREADS_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Missing THREADS_ACCESS_TOKEN in .env');
  process.exit(1);
}

const args = parseArgs();
const DELAY_MS = parseInt(args['delay'] || '200');
const BATCH_SIZE = parseInt(args['batch-size'] || '5000');
const SINCE = args['since'] || null;

process.env.DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure tracking table exists
await pool.query(`
  CREATE TABLE IF NOT EXISTS conversation_backfill_log (
    post_id TEXT PRIMARY KEY,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    reply_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ok'
  )
`);

async function getPostsToBackfill() {
  let whereClause = `WHERE p.text IS NOT NULL AND LENGTH(p.text) > 0`;
  const params = [];

  if (SINCE) {
    params.push(SINCE);
    whereClause += ` AND p.timestamp >= $${params.length}`;
  }

  params.push(BATCH_SIZE);
  const res = await pool.query(`
    SELECT p.id, p.timestamp
    FROM posts p
    LEFT JOIN conversation_backfill_log bl ON bl.post_id = p.id
    ${whereClause}
    AND bl.post_id IS NULL
    ORDER BY p.timestamp DESC
    LIMIT $${params.length}
  `, params);

  return res.rows;
}

async function fetchConversation(postId) {
  const url = `${BASE}/${postId}/conversation?fields=${FIELDS}&access_token=${TOKEN}`;
  try {
    const json = await fetchJSON(url);
    return { replies: json.data || [], status: 'ok' };
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('400') || msg.includes('404') || msg.includes('OAuthException') || msg.includes('10')) {
      return { replies: [], status: 'inaccessible' };
    }
    throw err;
  }
}

async function upsertReply(rootPostId, reply) {
  await pool.query(`
    INSERT INTO conversations (root_post_id, reply_post_id, reply_username, reply_text, reply_timestamp, depth, raw_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (root_post_id, reply_post_id) DO NOTHING
  `, [
    rootPostId,
    reply.id,
    reply.username || null,
    reply.text || null,
    reply.timestamp || null,
    1,
    JSON.stringify(reply),
  ]);
}

async function main() {
  console.log('Full Conversation Backfill');
  console.log('==========================\n');

  const totalPosts = (await pool.query(`SELECT COUNT(*) FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 0`)).rows[0].count;
  const alreadyDone = (await pool.query(`SELECT COUNT(*) FROM conversation_backfill_log`)).rows[0].count;
  const posts = await getPostsToBackfill();

  console.log(`Total posts with text: ${totalPosts}`);
  console.log(`Already attempted: ${alreadyDone}`);
  console.log(`This batch: ${posts.length} (delay: ${DELAY_MS}ms)`);
  if (SINCE) console.log(`Since: ${SINCE}`);
  console.log(`Estimated time: ${Math.round(posts.length * DELAY_MS / 1000 / 60)} minutes\n`);

  if (posts.length === 0) {
    console.log('Nothing to backfill!');
    await pool.end();
    return;
  }

  let processed = 0, totalReplies = 0, inaccessible = 0, noReplies = 0;
  const startTime = Date.now();
  const uniqueUsers = new Set();

  for (const post of posts) {
    processed++;
    const { replies, status } = await fetchConversation(post.id);

    // Log attempt
    await pool.query(`
      INSERT INTO conversation_backfill_log (post_id, reply_count, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id) DO UPDATE SET attempted_at = NOW(), reply_count = $2, status = $3
    `, [post.id, replies.length, status]);

    if (status === 'inaccessible') {
      inaccessible++;
    } else if (replies.length === 0) {
      noReplies++;
    } else {
      for (const reply of replies) {
        await upsertReply(post.id, reply);
        if (reply.username) uniqueUsers.add(reply.username);
      }
      totalReplies += replies.length;
    }

    if (processed % 50 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = (processed / elapsed).toFixed(1);
      console.log(`  ${processed}/${posts.length} — ${totalReplies} replies, ${inaccessible} inaccessible, ${uniqueUsers.size} unique users (${elapsed}s, ${rate}/s)`);
    }

    if (processed < posts.length) await sleep(DELAY_MS);
  }

  // Final stats
  const convCount = (await pool.query(`SELECT COUNT(*) FROM conversations`)).rows[0].count;
  const uniqueRepliers = (await pool.query(`SELECT COUNT(DISTINCT reply_username) FROM conversations WHERE reply_username IS NOT NULL`)).rows[0].count;

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDone in ${elapsed}s!`);
  console.log(`  Posts checked:    ${processed}`);
  console.log(`  Replies found:    ${totalReplies}`);
  console.log(`  Inaccessible:     ${inaccessible}`);
  console.log(`  No replies:       ${noReplies}`);
  console.log(`  Unique users:     ${uniqueUsers.size} this batch`);
  console.log(`  Total in DB:      ${convCount} conversation rows, ${uniqueRepliers} unique repliers`);
  console.log(`\n${parseInt(totalPosts) - parseInt(alreadyDone) - processed} posts remaining — run again to continue.`);

  await pool.end();
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
