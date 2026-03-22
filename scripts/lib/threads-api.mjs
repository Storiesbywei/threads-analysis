/**
 * threads-api.mjs — Shared Threads API client
 *
 * Single source of truth for API constants, pagination, and metrics fetching.
 * Used by threads-sync.mjs, sync-worker.mjs, backfill scripts.
 */

import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'https://graph.threads.net/v1.0';
export const FIELDS = 'id,text,media_type,media_url,thumbnail_url,permalink,shortcode,timestamp,is_quote_post,children,username';
export const INSIGHT_METRICS = 'views,likes,replies,reposts,quotes';

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Load .env file into an object. Does NOT mutate process.env.
 * For scripts that need process.env populated, use loadEnvIntoProcess().
 */
export function loadEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

/**
 * Load .env into process.env (only sets keys not already present).
 */
export function loadEnvIntoProcess(rootDir) {
  const env = loadEnv(rootDir);
  for (const [key, val] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = val;
  }
  return env;
}

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Paginated fetch of user posts.
 * @param {object} opts - { token, userId, since?, log? }
 * @returns {Promise<object[]>}
 */
export async function fetchPosts({ token, userId, since, log = console.log }) {
  const posts = [];
  let url = `${BASE}/${userId}/threads?fields=${FIELDS}&limit=100&access_token=${token}`;
  if (since) url += `&since=${since}`;

  let page = 0;
  while (url) {
    page++;
    log(`  Posts page ${page}...`);
    const json = await fetchJSON(url);
    if (json.data) posts.push(...json.data);
    url = json.paging?.next ?? null;
    if (url) await sleep(500);
  }
  return posts;
}

/**
 * Paginated fetch of user replies. Marks each with is_reply: true.
 * @param {object} opts - { token, userId, since?, log? }
 * @returns {Promise<object[]>}
 */
export async function fetchReplies({ token, userId, since, log = console.log }) {
  const replies = [];
  let url = `${BASE}/${userId}/replies?fields=${FIELDS}&limit=100&access_token=${token}`;
  if (since) url += `&since=${since}`;

  let page = 0;
  while (url) {
    page++;
    log(`  Replies page ${page}...`);
    const json = await fetchJSON(url);
    if (json.data) {
      for (const r of json.data) {
        r.is_reply = true;
        replies.push(r);
      }
    }
    url = json.paging?.next ?? null;
    if (url) await sleep(500);
  }
  return replies;
}

/**
 * Fetch engagement metrics for a single post.
 * Returns metrics object or null if unavailable.
 */
export async function fetchMetrics(postId, token) {
  try {
    const url = `${BASE}/${postId}/insights?metric=${INSIGHT_METRICS}&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;
    return Object.fromEntries(
      json.data.map(m => [m.name, m.values?.[0]?.value ?? 0])
    );
  } catch {
    return null;
  }
}

/**
 * Fetch conversation (replies from others) on a specific post.
 * Returns array of reply objects with depth info.
 */
export async function fetchConversation(postId, token) {
  try {
    const url = `${BASE}/${postId}/conversation?fields=${FIELDS}&access_token=${token}`;
    const json = await fetchJSON(url);
    if (!json.data) return [];
    return json.data.map((reply, i) => ({
      ...reply,
      _root_post_id: postId,
      _depth: 1,
    }));
  } catch {
    return [];
  }
}

/**
 * Parse CLI args like --batch=1000 --skip-metrics into an object.
 */
export function parseArgs(argv = process.argv) {
  return Object.fromEntries(
    argv.slice(2).filter(a => a.startsWith('--')).map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v !== undefined ? (parseInt(v) || v) : true];
    })
  );
}
