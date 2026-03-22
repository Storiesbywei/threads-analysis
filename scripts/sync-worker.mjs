#!/usr/bin/env node
/**
 * sync-worker.mjs — Docker entrypoint for automated Threads sync
 *
 * Runs on a configurable interval (SYNC_INTERVAL_MINUTES, default 30).
 * Each cycle:
 *   1. Incremental fetch of new posts + replies (in parallel)
 *   2. Upsert into Postgres (batched in transactions)
 *   3. Fetch metrics for recent posts
 *   4. Log sync run to sync_log table
 */

import {
  fetchPosts, fetchReplies, fetchMetrics, fetchConversation, sleep
} from './lib/threads-api.mjs';
import {
  upsertPost, insertMetrics, upsertCarouselItems, upsertConversation,
  startSyncLog, updateSyncLog, refreshMetricsView,
  getLatestPostTimestamp, getRecentOriginalPostIds, transaction, close
} from './db.mjs';

const TOKEN = process.env.THREADS_ACCESS_TOKEN;
const USER_ID = process.env.THREADS_USER_ID;
const INTERVAL = (parseInt(process.env.SYNC_INTERVAL_MINUTES) || 30) * 60 * 1000;
const METRICS_BATCH = parseInt(process.env.METRICS_BATCH_SIZE) || 200;
const FULL_ON_START = process.env.FULL_SYNC_ON_START === 'true';
const MAX_ERROR_DETAILS = 20;

if (!TOKEN || !USER_ID) {
  console.error('Missing THREADS_ACCESS_TOKEN or THREADS_USER_ID');
  process.exit(1);
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── INTERRUPTIBLE SLEEP ────────────────────────────────────

let abortController = new AbortController();

function interruptibleSleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    abortController.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

// ─── SINGLE SYNC CYCLE ─────────────────────────────────────

async function syncCycle(isFirstRun) {
  const syncType = (isFirstRun && FULL_ON_START) ? 'full' : 'incremental';
  const logId = await startSyncLog(syncType);
  const stats = { postsFetched: 0, postsNew: 0, postsUpdated: 0, metricsFetched: 0, errors: 0, errorDetails: [] };
  const apiOpts = { token: TOKEN, userId: USER_ID, log };

  try {
    let since = null;
    if (syncType === 'incremental') {
      const latest = await getLatestPostTimestamp();
      if (latest) {
        since = new Date(latest).toISOString().split('T')[0];
        log(`Incremental sync since ${since}`);
      } else {
        log('No posts in DB — doing full sync');
      }
    } else {
      log('Full sync requested');
    }

    // Fetch posts + replies in parallel
    const [posts, replies] = await Promise.all([
      fetchPosts({ ...apiOpts, since }),
      fetchReplies({ ...apiOpts, since }),
    ]);
    const allItems = [...posts, ...replies];
    stats.postsFetched = allItems.length;
    log(`Fetched ${posts.length} posts + ${replies.length} replies = ${allItems.length} total`);

    // Upsert into Postgres in transaction batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      try {
        await transaction(async (client) => {
          for (const post of batch) {
            try {
              await upsertPost(post, client);
              stats.postsNew++;
              if (post.media_type === 'CAROUSEL_ALBUM' && post.children) {
                await upsertCarouselItems(post.id, post.children, client);
              }
            } catch (err) {
              stats.errors++;
              if (stats.errorDetails.length < MAX_ERROR_DETAILS) {
                stats.errorDetails.push({ postId: post.id, error: err.message });
              }
            }
          }
        });
      } catch (err) {
        stats.errors += batch.length;
        if (stats.errorDetails.length < MAX_ERROR_DETAILS) {
          stats.errorDetails.push({ phase: 'batch_transaction', error: err.message });
        }
      }
    }
    log(`Upserted ${stats.postsNew} posts (${stats.errors} errors)`);

    // Fetch metrics for recent posts
    const metricsItems = allItems
      .filter(p => p.media_type !== 'REPOST_FACADE')
      .slice(0, METRICS_BATCH);

    log(`Fetching metrics for ${metricsItems.length} posts...`);
    for (const post of metricsItems) {
      const metrics = await fetchMetrics(post.id, TOKEN);
      if (metrics) {
        await insertMetrics(post.id, metrics);
        stats.metricsFetched++;
      }
      await sleep(100);
    }
    log(`Fetched ${stats.metricsFetched} metrics snapshots`);

    if (stats.metricsFetched > 0) {
      try {
        await refreshMetricsView();
        log('Refreshed metrics_latest view');
      } catch (err) {
        log(`Could not refresh metrics view: ${err.message}`);
      }
    }

    // Fetch conversations (comments on recent original posts)
    const CONVERSATION_BATCH = 100;
    const recentPostIds = await getRecentOriginalPostIds(CONVERSATION_BATCH);
    let convoCount = 0;
    log(`Fetching conversations for ${recentPostIds.length} recent posts...`);
    for (const postId of recentPostIds) {
      const replies = await fetchConversation(postId, TOKEN);
      for (const reply of replies) {
        try {
          await upsertConversation(postId, reply);
          convoCount++;
        } catch {
          // reply post may not exist in posts table (FK constraint)
        }
      }
      await sleep(200);
    }
    log(`Fetched ${convoCount} conversation replies`);

    await updateSyncLog(logId, { ...stats, status: 'completed' });
    log(`Sync complete — ${stats.postsNew} new, ${stats.metricsFetched} metrics, ${convoCount} conversations, ${stats.errors} errors`);

  } catch (err) {
    stats.errors++;
    if (stats.errorDetails.length < MAX_ERROR_DETAILS) {
      stats.errorDetails.push({ phase: 'sync_cycle', error: err.message });
    }
    await updateSyncLog(logId, { ...stats, status: 'failed' }).catch(() => {});
    log(`Sync failed: ${err.message}`);
  }
}

// ─── MAIN LOOP ──────────────────────────────────────────────

let isShuttingDown = false;

async function main() {
  log('Threads Sync Worker starting');
  log(`  User: ${USER_ID}`);
  log(`  Interval: ${INTERVAL / 60000} minutes`);
  log(`  Metrics batch: ${METRICS_BATCH}`);
  log(`  Full on start: ${FULL_ON_START}`);

  let runCount = 0;

  while (!isShuttingDown) {
    runCount++;
    log(`\n── Sync cycle #${runCount} ──────────────────────`);
    await syncCycle(runCount === 1);

    if (isShuttingDown) break;

    log(`Next sync in ${INTERVAL / 60000} minutes...`);
    await interruptibleSleep(INTERVAL);
  }

  log('Shutting down...');
  await close();
  process.exit(0);
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`Received ${sig}`);
    isShuttingDown = true;
    abortController.abort();
  });
}

main().catch(err => {
  console.error('Worker crashed:', err);
  process.exit(1);
});
