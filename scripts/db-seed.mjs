#!/usr/bin/env node
/**
 * db-seed.mjs — Backfill existing posts.json into Postgres
 *
 * Usage: node scripts/db-seed.mjs [--batch=1000] [--skip-metrics]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvIntoProcess, parseArgs } from './lib/threads-api.mjs';
import {
  upsertPost, insertMetrics, upsertCarouselItems,
  startSyncLog, updateSyncLog, transaction, close
} from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
loadEnvIntoProcess(ROOT);

const args = parseArgs();
const BATCH_SIZE = args['batch'] || 1000;
const SKIP_METRICS = args['skip-metrics'] === true;
const POSTS_FILE = path.join(ROOT, 'data', 'threads', 'posts.json');

async function main() {
  console.log('Threads DB Seed');
  console.log('================\n');

  if (!fs.existsSync(POSTS_FILE)) {
    console.error(`No posts file at ${POSTS_FILE}`);
    console.error('Run "npm run sync" first, or symlink from ByTheWeiCo.');
    process.exit(1);
  }

  console.log('Loading posts.json...');
  const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
  const posts = data.posts || [];
  console.log(`Loaded ${posts.length} posts\n`);

  const logId = await startSyncLog('seed');
  const stats = { postsFetched: posts.length, postsNew: 0, postsUpdated: 0, metricsFetched: 0, errors: 0, errorDetails: [] };
  const startTime = Date.now();
  const totalBatches = Math.ceil(posts.length / BATCH_SIZE);

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const batch = posts.slice(batchNum * BATCH_SIZE, (batchNum + 1) * BATCH_SIZE);

    try {
      await transaction(async (client) => {
        for (const post of batch) {
          try {
            await upsertPost(post, client);
            stats.postsNew++;

            if (post.media_type === 'CAROUSEL_ALBUM' && post.children) {
              await upsertCarouselItems(post.id, post.children, client);
            }

            if (!SKIP_METRICS && post.metrics && Object.keys(post.metrics).length > 0) {
              const inserted = await insertMetrics(post.id, post.metrics, client);
              if (inserted) stats.metricsFetched++;
            }
          } catch (err) {
            stats.errors++;
            if (stats.errorDetails.length < 20) {
              stats.errorDetails.push({ postId: post.id, error: err.message });
            }
          }
        }
      });
    } catch (err) {
      console.error(`  Batch ${batchNum + 1} transaction failed: ${err.message}`);
      stats.errors += batch.length;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (stats.postsNew / ((Date.now() - startTime) / 1000)).toFixed(0);
    console.log(`  Batch ${batchNum + 1}/${totalBatches} — ${stats.postsNew} posts, ${stats.metricsFetched} metrics (${elapsed}s, ~${rate}/s)`);
  }

  await updateSyncLog(logId, { ...stats, status: stats.errors > posts.length * 0.1 ? 'failed' : 'completed' });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const replyCount = posts.filter(p => p.is_reply).length;
  const quoteCount = posts.filter(p => p.is_quote_post).length;

  console.log(`\nDone in ${elapsed}s!`);
  console.log(`  Posts seeded: ${stats.postsNew}`);
  console.log(`  Metrics inserted: ${stats.metricsFetched}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`\nCorpus breakdown:`);
  console.log(`  Original posts: ${posts.length - replyCount - quoteCount}`);
  console.log(`  Replies: ${replyCount}`);
  console.log(`  Quotes: ${quoteCount}`);

  if (stats.errors > 0 && stats.errorDetails.length > 0) {
    console.log(`\nFirst ${Math.min(stats.errorDetails.length, 10)} errors:`);
    for (const e of stats.errorDetails.slice(0, 10)) {
      console.log(`  ${e.postId}: ${e.error}`);
    }
  }

  await close();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
