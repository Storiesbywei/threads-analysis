#!/usr/bin/env node
/**
 * haiku-agent.mjs — Picks random posts across time periods,
 * generates a haiku that captures their essence, posts to API,
 * and sends via iMessage.
 *
 * Usage:
 *   node scripts/haiku-agent.mjs           # run once
 *   node scripts/haiku-agent.mjs --loop    # run 2-4 random times per day
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load env
const envPath = path.join(ROOT, '.env');
import fs from 'node:fs';
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const FLASK_URL = process.env.FLASK_URL || 'http://localhost:4323';
const ALERT_PHONE = process.env.ALERT_PHONE;
const HAIKU_MODEL = process.env.HAIKU_MODEL || 'qwen3:14b';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

// ─── Helpers ──────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function sendIMessage(text) {
  if (!ALERT_PHONE) {
    console.log('  No ALERT_PHONE set, skipping iMessage');
    return;
  }
  try {
    const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    execSync(`osascript -e 'tell application "Messages" to send "${escaped}" to buddy "${ALERT_PHONE}"'`);
    console.log('  iMessage sent');
  } catch (e) {
    console.error('  iMessage failed:', e.message);
  }
}

// ─── Fetch random posts across time periods ─────────────

async function getRandomPosts() {
  // Pick posts from different eras
  const periods = [
    { name: 'ancient', sql: "timestamp < NOW() - INTERVAL '1 year'" },
    { name: 'old', sql: "timestamp BETWEEN NOW() - INTERVAL '1 year' AND NOW() - INTERVAL '6 months'" },
    { name: 'recent', sql: "timestamp BETWEEN NOW() - INTERVAL '6 months' AND NOW() - INTERVAL '1 month'" },
    { name: 'fresh', sql: "timestamp > NOW() - INTERVAL '1 month'" },
  ];

  const posts = [];
  for (const period of periods) {
    const { rows } = await pool.query(`
      SELECT id, text, timestamp, variety
      FROM posts
      WHERE text IS NOT NULL AND text != '' AND ${period.sql}
      ORDER BY RANDOM()
      LIMIT 2
    `);
    for (const r of rows) {
      posts.push({ ...r, period: period.name });
    }
  }

  // Also grab one high-surprise post if available
  const { rows: surprise } = await pool.query(`
    SELECT p.id, p.text, p.timestamp, p.variety, s.surprise
    FROM posts p
    JOIN surprise_scores s ON s.post_id = p.id
    WHERE p.text IS NOT NULL AND s.surprise > 10
    ORDER BY RANDOM()
    LIMIT 1
  `);
  if (surprise.length) posts.push({ ...surprise[0], period: 'surprising' });

  return posts;
}

// ─── Generate haiku via Ollama ──────────────────────────

async function generateHaiku(posts) {
  const context = posts.map((p, i) =>
    `[${p.period}] "${p.text.slice(0, 200)}"`
  ).join('\n');

  const prompt = `You are a haiku poet. Given these social media posts from different time periods by @maybe_foucault, write exactly ONE haiku (5-7-5 syllable structure) that captures the essence, mood, or a surprising connection between the posts.

Posts:
${context}

Rules:
- Exactly 3 lines: 5 syllables, 7 syllables, 5 syllables
- No titles, no explanation, just the haiku
- Be poetic, not literal
- Find the unexpected thread connecting these moments`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: HAIKU_MODEL, prompt, stream: false }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const { response } = await res.json();

  // Clean up — extract just the 3 lines
  const lines = response.trim().split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('*') && !l.startsWith('-') && !l.startsWith('#'));

  return lines.slice(0, 3).join('\n');
}

// ─── Post to API endpoint (graph-based logging) ────────

async function postHaiku(haiku, sourcePosts) {
  // Insert haiku node, get UUID back
  const { rows } = await pool.query(
    'INSERT INTO haikus (haiku, model) VALUES ($1, $2) RETURNING uuid',
    [haiku, HAIKU_MODEL]
  );
  const uuid = rows[0].uuid;

  // Insert edges: haiku -> each source post
  for (const p of sourcePosts) {
    await pool.query(
      `INSERT INTO haiku_edges (haiku_uuid, post_id, period, post_text, post_timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (haiku_uuid, post_id) DO NOTHING`,
      [uuid, p.id, p.period, p.text?.slice(0, 500) || null, p.timestamp]
    );
  }

  return uuid;
}

// ─── Main: single run ───────────────────────────────────

async function runOnce() {
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  console.log(`\n[${now}] Haiku Agent`);

  const posts = await getRandomPosts();
  console.log(`  Found ${posts.length} posts across ${[...new Set(posts.map(p => p.period))].join(', ')}`);

  if (posts.length < 3) {
    console.log('  Not enough posts, skipping');
    return;
  }

  const haiku = await generateHaiku(posts);
  console.log(`  Haiku:\n    ${haiku.replace(/\n/g, '\n    ')}`);

  const uuid = await postHaiku(haiku, posts);
  console.log(`  Saved to DB (${uuid})`);

  // Send via iMessage with UUID
  const msg = `${haiku}\n\n— haiku oracle, ${now}\nid: ${uuid}`;
  sendIMessage(msg);

  return { uuid, haiku };
}

// ─── Loop mode: 2-4 random times per day ────────────────

async function runLoop() {
  console.log('Haiku Agent — Loop Mode');
  console.log('Will generate 2-4 haikus per day at random times\n');

  while (true) {
    // Generate today's schedule: 2-4 random hours
    const count = randomInt(2, 4);
    const hours = [];
    for (let i = 0; i < count; i++) {
      hours.push(randomInt(8, 23)); // between 8am and 11pm
    }
    hours.sort((a, b) => a - b);

    const now = new Date();
    console.log(`[${now.toLocaleDateString()}] Today's schedule: ${hours.map(h => `${h}:00`).join(', ')}`);

    for (const targetHour of hours) {
      const current = new Date();
      const target = new Date(current);
      target.setHours(targetHour, randomInt(0, 59), 0, 0);

      if (target <= current) continue; // skip if hour already passed

      const waitMs = target - current;
      const waitMin = Math.round(waitMs / 60000);
      console.log(`  Next haiku at ~${target.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (in ${waitMin}m)`);

      await sleep(waitMs);

      try {
        await runOnce();
      } catch (e) {
        console.error(`  Error: ${e.message}`);
      }
    }

    // Sleep until tomorrow 7am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 0, 0, 0);
    const sleepMs = tomorrow - new Date();
    console.log(`\nSleeping until tomorrow ${tomorrow.toLocaleDateString()}...`);
    await sleep(sleepMs);
  }
}

// ─── Entry point ────────────────────────────────────────

const isLoop = process.argv.includes('--loop');

if (isLoop) {
  runLoop().catch(e => { console.error('Fatal:', e); process.exit(1); });
} else {
  runOnce()
    .then(() => pool.end())
    .catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
}
