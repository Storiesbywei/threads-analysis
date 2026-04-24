#!/usr/bin/env node
/**
 * embed-conversations.mjs — Embed conversation reply texts via Ollama nomic-embed-text-v2-moe
 *
 * Usage: node scripts/embed-conversations.mjs [--batch-size=100] [--concurrency=10]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/threads-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const env = loadEnv(ROOT);

process.env.DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
const OLLAMA_URL = env.OLLAMA_URL || process.env.OLLAMA_URL || 'http://localhost:11434';

const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.slice(2).split('=');
    return [k, v || 'true'];
  })
);
const BATCH_SIZE = parseInt(args['batch-size'] || '100');
const CONCURRENCY = parseInt(args['concurrency'] || '10');

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text-v2-moe', prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

async function main() {
  const total = (await pool.query(`
    SELECT COUNT(*) FROM conversations WHERE reply_text IS NOT NULL AND LENGTH(reply_text) > 0 AND embedding IS NULL
  `)).rows[0].count;

  console.log(`Conversations to embed: ${total}`);
  if (total === '0') { console.log('All done!'); await pool.end(); return; }

  let embedded = 0, errors = 0;

  while (true) {
    const batch = await pool.query(`
      SELECT id, reply_text FROM conversations
      WHERE reply_text IS NOT NULL AND LENGTH(reply_text) > 0 AND embedding IS NULL
      LIMIT $1
    `, [BATCH_SIZE]);

    if (batch.rows.length === 0) break;

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < batch.rows.length; i += CONCURRENCY) {
      const chunk = batch.rows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(async (row) => {
        try {
          const vec = await embed(row.reply_text);
          await pool.query(`UPDATE conversations SET embedding = $1 WHERE id = $2`, [`[${vec}]`, row.id]);
          return true;
        } catch (err) {
          errors++;
          return false;
        }
      }));
      embedded += results.filter(Boolean).length;
    }

    console.log(`Progress: ${embedded}/${total} embedded (${errors} errors)`);
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone. Embedded ${embedded} conversations (${errors} errors).`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
