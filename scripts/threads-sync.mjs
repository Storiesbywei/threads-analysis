#!/usr/bin/env node
/**
 * threads-sync.mjs — Fetch all Threads posts for @maybe_foucault
 * and save to data/threads/posts.json
 *
 * Usage: node scripts/threads-sync.mjs
 * Requires: THREADS_ACCESS_TOKEN and THREADS_USER_ID in .env
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadEnv, fetchPosts, fetchReplies, fetchMetrics, sleep
} from './lib/threads-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const env = loadEnv(ROOT);
const TOKEN = env.THREADS_ACCESS_TOKEN || process.env.THREADS_ACCESS_TOKEN;
const USER_ID = env.THREADS_USER_ID || process.env.THREADS_USER_ID;

if (!TOKEN || !USER_ID) {
  console.error('Missing THREADS_ACCESS_TOKEN or THREADS_USER_ID in .env');
  process.exit(1);
}

const OUTPUT_DIR = path.join(ROOT, 'data', 'threads');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'posts.json');

async function main() {
  console.log('Threads Sync — @maybe_foucault');
  console.log('================================\n');

  let existingPosts = [];
  let lastFetched = null;

  if (fs.existsSync(OUTPUT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    existingPosts = existing.posts || [];
    lastFetched = existing.last_fetched || null;
    console.log(`Found ${existingPosts.length} existing posts (last sync: ${lastFetched})`);
  }

  const apiOpts = { token: TOKEN, userId: USER_ID, since: lastFetched };

  console.log(`\nFetching posts${lastFetched ? ` since ${lastFetched}` : ' (full history)'}...`);
  const newPosts = await fetchPosts(apiOpts);
  console.log(`Fetched ${newPosts.length} posts from API`);

  console.log(`\nFetching replies${lastFetched ? ` since ${lastFetched}` : ' (full history)'}...`);
  const newReplies = await fetchReplies(apiOpts);
  console.log(`Fetched ${newReplies.length} replies from API`);

  const allNew = [...newPosts, ...newReplies];

  // Fetch metrics for the most recent 200 items
  const METRICS_LIMIT = 200;
  const postsForMetrics = allNew.slice(0, METRICS_LIMIT);
  console.log(`\nFetching engagement metrics for ${postsForMetrics.length} most recent posts/replies...`);
  let metricsCount = 0;
  for (const post of postsForMetrics) {
    post.metrics = await fetchMetrics(post.id, TOKEN) || {};
    metricsCount++;
    if (metricsCount % 20 === 0) {
      console.log(`  ${metricsCount}/${postsForMetrics.length} metrics fetched...`);
      await sleep(500);
    } else {
      await sleep(100);
    }
  }
  console.log(`Fetched metrics for ${metricsCount} posts`);

  // Merge: deduplicate by ID, new posts take precedence
  const postMap = new Map();
  for (const post of existingPosts) postMap.set(post.id, post);
  for (const post of allNew) postMap.set(post.id, post);

  const allPosts = Array.from(postMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    last_fetched: new Date().toISOString(),
    user: { id: USER_ID, username: 'maybe_foucault' },
    total_posts: allPosts.length,
    posts: allPosts
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  const replyCount = allPosts.filter(p => p.is_reply).length;
  const postCount = allPosts.length - replyCount;
  const withMetrics = allPosts.filter(p => p.metrics && Object.keys(p.metrics).length > 0);
  const totalLikes = allPosts.reduce((sum, p) => sum + (p.metrics?.likes || 0), 0);
  const totalViews = allPosts.reduce((sum, p) => sum + (p.metrics?.views || 0), 0);

  console.log(`\nDone! ${allPosts.length} total items (${postCount} posts + ${replyCount} replies) saved`);
  console.log(`\nSummary:`);
  console.log(`  Posts: ${postCount}`);
  console.log(`  Replies: ${replyCount}`);
  console.log(`  Total: ${allPosts.length}`);
  console.log(`  With metrics: ${withMetrics.length}`);
  console.log(`  Total likes: ${totalLikes.toLocaleString()}`);
  console.log(`  Total views: ${totalViews.toLocaleString()}`);
  console.log(`  Date range: ${allPosts[allPosts.length - 1]?.timestamp || 'n/a'} → ${allPosts[0]?.timestamp || 'n/a'}`);
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
