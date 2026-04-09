#!/usr/bin/env node
/**
 * backfill-haleigh-conversations.mjs
 *
 * Fetches conversation threads for all posts where Wei mentioned or interacted with Haleigh
 * (@haright / @hihaleyyy), inserting any replies from her into the conversations table.
 *
 * Usage: node scripts/backfill-haleigh-conversations.mjs [--delay=500] [--dry-run]
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
const DELAY_MS = args['delay'] || 500;
const DRY_RUN = args['dry-run'] || false;

// Lazy DB import so DATABASE_URL is set first
process.env.DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getTargetPostIds() {
  const res = await pool.query(`
    SELECT DISTINCT id FROM posts
    WHERE text ILIKE '%haright%'
       OR text ILIKE '%hihaleyyy%'
       OR text ILIKE '%haleigh%'
    UNION
    SELECT DISTINCT post_id AS id FROM interactions
    WHERE to_username IN ('haright', 'hihaleyyy')
    ORDER BY id
  `);
  return res.rows.map(r => r.id);
}

async function fetchConversation(postId) {
  const url = `${BASE}/${postId}/conversation?fields=${FIELDS}&access_token=${TOKEN}`;
  try {
    const json = await fetchJSON(url);
    return json.data || [];
  } catch (err) {
    // 400 / permission errors are common for old posts — log and continue
    const msg = err.message || '';
    if (msg.includes('400') || msg.includes('404') || msg.includes('OAuthException')) {
      return null; // signal "not accessible"
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
  console.log('Haleigh Conversation Backfill');
  console.log('==============================\n');

  if (DRY_RUN) console.log('[DRY RUN — no DB writes]\n');

  const postIds = await getTargetPostIds();
  console.log(`Target posts: ${postIds.length}\n`);

  let fetched = 0, inserted = 0, skipped = 0, errors = 0;
  let haleighReplies = 0;

  for (const postId of postIds) {
    process.stdout.write(`  [${++fetched}/${postIds.length}] post ${postId} ... `);
    const replies = await fetchConversation(postId);

    if (replies === null) {
      process.stdout.write('inaccessible\n');
      errors++;
    } else if (replies.length === 0) {
      process.stdout.write('no replies\n');
      skipped++;
    } else {
      const haleighInThread = replies.filter(r =>
        r.username === 'haright' || r.username === 'hihaleyyy'
      );
      process.stdout.write(`${replies.length} replies (${haleighInThread.length} from Haleigh)\n`);

      if (!DRY_RUN) {
        for (const reply of replies) {
          await upsertReply(postId, reply);
          inserted++;
        }
      }
      haleighReplies += haleighInThread.length;
    }

    if (fetched < postIds.length) await sleep(DELAY_MS);
  }

  // Final summary
  const finalCount = await pool.query(
    `SELECT COUNT(*) FROM conversations WHERE reply_username IN ('haright', 'hihaleyyy')`
  );

  console.log('\nDone!');
  console.log(`  Posts checked:        ${fetched}`);
  console.log(`  Inaccessible:         ${errors}`);
  console.log(`  No replies:           ${skipped}`);
  console.log(`  Total replies upserted: ${DRY_RUN ? '(dry run)' : inserted}`);
  console.log(`  Haleigh replies found:  ${haleighReplies}`);
  console.log(`  Haleigh rows in DB now: ${finalCount.rows[0].count}`);

  await pool.end();
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
