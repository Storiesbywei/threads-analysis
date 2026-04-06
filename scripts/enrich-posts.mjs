/**
 * enrich-posts.mjs — Compute free enrichment tags for all posts (no LLM needed)
 *
 * Fills: sentiment, energy, intent, language, hour_bucket, is_weekend
 * Usage: node scripts/enrich-posts.mjs
 */

import { loadEnvIntoProcess } from './lib/threads-api.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.resolve(__dirname, '..'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

const BATCH_SIZE = 500;

// ─── Classifiers ────────────────────────────────────────────────

const POSITIVE = new Set(['love','great','amazing','awesome','good','nice','beautiful','happy','fun','fantastic','perfect','best','wonderful','excellent','brilliant','neat','dope','goated','banger','fire']);
const NEGATIVE = new Set(['hate','bad','terrible','awful','worst','ugly','sad','angry','stupid','dumb','boring','shit','fuck','hell','damn','ugh','gross','ew','cringe']);

function sentiment(text) {
  if (!text) return null;
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) score += 1;
    if (NEGATIVE.has(w)) score -= 1;
  }
  return Math.max(-1, Math.min(1, score / Math.max(words.length, 1) * 5));
}

function energy(text) {
  if (!text) return null;
  const caps = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  const excl = (text.match(/!/g) || []).length;
  const len = text.length;
  const score = caps * 3 + excl * 0.5 + (len > 200 ? 1 : 0);
  if (score > 2) return 'high';
  if (score > 0.5) return 'mid';
  return 'low';
}

function intent(text, variety) {
  if (!text) return null;
  const t = text.trim();
  if (t.includes('?') || t.toLowerCase().startsWith('what') || t.toLowerCase().startsWith('how') || t.toLowerCase().startsWith('why')) return 'question';
  if (t.startsWith('http') || t.includes('https://')) return 'share';
  if (t.startsWith('@')) return 'social';
  if (t.length < 15 && !t.includes(' ')) return 'reaction';
  if (variety === 'reply' && t.length < 30) return 'reaction';
  const lower = t.toLowerCase();
  if (lower.includes('lmao') || lower.includes('bruh') || lower.includes('fr fr') || lower.includes('no homo') || lower.includes('cum ')) return 'shitpost';
  return 'statement';
}

function detectLang(text) {
  if (!text) return null;
  if (/[\u00e0\u00e1\u1ea3\u00e3\u1ea1\u00e8\u00e9\u1ebb\u1ebd\u1eb9\u00ec\u00ed\u1ec9\u0129\u1ecb\u00f2\u00f3\u1ecf\u00f5\u1ecd\u00f9\u00fa\u1ee7\u0169\u1ee5\u1ef3\u00fd\u1ef7\u1ef9\u1ef5]/i.test(text)) return 'vi';
  if (/\b(und|der|die|das|ist|nicht|ich|ein|f\u00fcr|auf|mit|sich)\b/i.test(text)) return 'de';
  if (/\b(que|por|para|como|pero|m\u00e1s|est\u00e1|tiene|nosotros|tambi\u00e9n)\b/i.test(text)) return 'es';
  return 'en';
}

function timeMeta(timestamp) {
  const d = new Date(timestamp);
  return {
    hour_bucket: d.getUTCHours(),
    is_weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
  };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const countResult = await pool.query('SELECT COUNT(*) FROM posts WHERE text IS NOT NULL');
  const total = parseInt(countResult.rows[0].count);
  console.log(`Enriching ${total} posts in batches of ${BATCH_SIZE}...`);

  let offset = 0;
  let enriched = 0;

  while (offset < total) {
    const { rows } = await pool.query(
      'SELECT id, text, variety, timestamp FROM posts WHERE text IS NOT NULL ORDER BY id LIMIT $1 OFFSET $2',
      [BATCH_SIZE, offset]
    );
    if (rows.length === 0) break;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const s = sentiment(row.text);
        const e = energy(row.text);
        const i = intent(row.text, row.variety);
        const lang = detectLang(row.text);
        const tm = timeMeta(row.timestamp);

        await client.query(
          'UPDATE posts SET sentiment=$1, energy=$2, intent=$3, language=$4, hour_bucket=$5, is_weekend=$6 WHERE id=$7',
          [s, e, i, lang, tm.hour_bucket, tm.is_weekend, row.id]
        );
      }
      await client.query('COMMIT');
      enriched += rows.length;
      console.log(`  ${enriched}/${total} (${Math.round(enriched / total * 100)}%)`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    offset += BATCH_SIZE;
  }

  console.log(`Done. Enriched ${enriched} posts.`);
  await pool.end();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
