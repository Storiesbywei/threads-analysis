#!/usr/bin/env node
/**
 * threads-backfill-replies.mjs — One-time full history backfill of user's replies
 *
 * Usage: node scripts/threads-backfill-replies.mjs [--delay=500]
 *
 * Fetches ALL replies via GET /{user-id}/replies (paginated, full history).
 * Marks each with is_reply: true, merges into existing posts.json (dedup by ID).
 * Safe to interrupt and resume — skips already-merged IDs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, fetchJSON, sleep, parseArgs, BASE, FIELDS } from './lib/threads-api.mjs';

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
const CHECKPOINT_INTERVAL = 500;

const args = parseArgs();
const DELAY_MS = args['delay'] || 500;

async function main() {
  console.log('Threads Reply Backfill');
  console.log('======================\n');

  let data = { last_fetched: null, user: { id: USER_ID, username: 'maybe_foucault' }, total_posts: 0, posts: [] };
  if (fs.existsSync(OUTPUT_FILE)) {
    data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  }

  const existingIds = new Set((data.posts || []).map(p => p.id));
  const existingReplyCount = (data.posts || []).filter(p => p.is_reply).length;
  console.log(`Existing posts: ${data.posts?.length || 0} (${existingReplyCount} replies)`);

  let url = `${BASE}/${USER_ID}/replies?fields=${FIELDS}&limit=100&access_token=${TOKEN}`;
  let page = 0, fetched = 0, newReplies = 0, skipped = 0;
  const startTime = Date.now();

  while (url) {
    page++;
    console.log(`  Fetching replies page ${page}...`);
    const json = await fetchJSON(url);

    if (json.data) {
      for (const reply of json.data) {
        fetched++;
        if (existingIds.has(reply.id)) { skipped++; continue; }
        reply.is_reply = true;
        data.posts.push(reply);
        existingIds.add(reply.id);
        newReplies++;
      }
    }

    if (newReplies > 0 && newReplies % CHECKPOINT_INTERVAL < 100) {
      data.total_posts = data.posts.length;
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  [checkpoint] ${newReplies} new replies merged, ${fetched} total fetched (${elapsed}s)`);
    }

    url = json.paging?.next ?? null;
    if (url) await sleep(DELAY_MS);
  }

  data.posts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  data.total_posts = data.posts.length;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

  const totalReplies = data.posts.filter(p => p.is_reply).length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log(`\nDone in ${elapsed}s!`);
  console.log(`  Pages fetched: ${page}`);
  console.log(`  Replies from API: ${fetched}`);
  console.log(`  New replies merged: ${newReplies}`);
  console.log(`  Already existed (skipped): ${skipped}`);
  console.log(`  Total posts in file: ${data.posts.length} (${totalReplies} replies)`);
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
