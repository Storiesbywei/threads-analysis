#!/usr/bin/env node
/**
 * threads-backfill-metrics.mjs — Backfill engagement metrics for ALL posts
 * that don't already have them in posts.json
 *
 * Usage: node scripts/threads-backfill-metrics.mjs [--batch-size=500] [--delay=150]
 *
 * Safe to interrupt and resume — only updates posts that lack metrics.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, fetchMetrics, sleep, parseArgs } from './lib/threads-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const env = loadEnv(ROOT);
const TOKEN = env.THREADS_ACCESS_TOKEN || process.env.THREADS_ACCESS_TOKEN;
if (!TOKEN) { console.error('Missing THREADS_ACCESS_TOKEN in .env'); process.exit(1); }

const OUTPUT_FILE = path.join(ROOT, 'data', 'threads', 'posts.json');
const args = parseArgs();
const BATCH_SIZE = args['batch-size'] || 500;
const DELAY_MS = args['delay'] || 150;

async function main() {
  console.log('Threads Metrics Backfill');
  console.log('========================\n');

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error('No posts.json found. Run threads-sync.mjs first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  const posts = data.posts || [];
  console.log(`Total posts: ${posts.length}`);

  const needsMetrics = posts.filter(p =>
    !p.metrics || Object.keys(p.metrics).length === 0 ||
    (p.metrics.views === undefined && p.metrics.likes === undefined)
  );
  console.log(`Posts without metrics: ${needsMetrics.length}`);
  console.log(`Posts with metrics: ${posts.length - needsMetrics.length}`);

  if (needsMetrics.length === 0) {
    console.log('\nAll posts already have metrics!');
    return;
  }

  const batch = needsMetrics.slice(0, BATCH_SIZE);
  console.log(`\nBackfilling batch of ${batch.length} posts (delay: ${DELAY_MS}ms)...`);
  console.log(`Estimated time: ${Math.ceil(batch.length * DELAY_MS / 60000)} minutes\n`);

  let fetched = 0, success = 0, failed = 0;
  const startTime = Date.now();

  for (const post of batch) {
    const metrics = await fetchMetrics(post.id, TOKEN);
    fetched++;

    if (metrics && Object.keys(metrics).length > 0) {
      post.metrics = metrics;
      success++;
    } else {
      post.metrics = { _backfill_attempted: true };
      failed++;
    }

    if (fetched % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (fetched / (Date.now() - startTime) * 1000).toFixed(1);
      console.log(`  ${fetched}/${batch.length} — ${success} ok, ${failed} unavailable (${elapsed}s, ${rate}/s)`);

      data.posts = posts;
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    }

    await sleep(DELAY_MS);
  }

  data.posts = posts;
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

  const totalWithMetrics = posts.filter(p => p.metrics && p.metrics.views !== undefined).length;
  const totalViews = posts.reduce((s, p) => s + (p.metrics?.views || 0), 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log(`\nDone in ${elapsed}s!`);
  console.log(`  Batch: ${success} fetched, ${failed} unavailable`);
  console.log(`  Total posts with metrics: ${totalWithMetrics}/${posts.length}`);
  console.log(`  Total views: ${totalViews.toLocaleString()}`);

  if (needsMetrics.length > BATCH_SIZE) {
    console.log(`\n${needsMetrics.length - BATCH_SIZE} posts remaining — run again to continue.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
