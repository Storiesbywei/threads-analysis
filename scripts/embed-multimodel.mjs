#!/usr/bin/env node
/**
 * embed-multimodel.mjs — Embed posts + conversations with multiple Ollama models concurrently
 *
 * Usage:
 *   node scripts/embed-multimodel.mjs --table=posts --model=all-minilm --column=embedding_minilm
 *   node scripts/embed-multimodel.mjs --table=posts --model=all --batch-size=50
 *   node scripts/embed-multimodel.mjs --table=conversations --model=all
 *
 * --model=all runs all 6 models sequentially (each model batched internally)
 * --concurrency controls parallel Ollama requests per model (default 5, be gentle)
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

const TABLE = args['table'] || 'posts';
const MODEL_ARG = args['model'] || 'all';
const BATCH_SIZE = parseInt(args['batch-size'] || '50');
const CONCURRENCY = parseInt(args['concurrency'] || '5');

const MODELS = [
  { name: 'nomic-embed-text-v2-moe', column: 'embedding', dim: 768 },
  { name: 'all-minilm', column: 'embedding_minilm', dim: 384 },
  { name: 'bge-m3', column: 'embedding_bge_m3', dim: 1024 },
  { name: 'qwen3-embedding:0.6b', column: 'embedding_qwen3', dim: 1024 },
  { name: 'snowflake-arctic-embed2', column: 'embedding_arctic2', dim: 1024 },
  { name: 'nomic-embed-text-v2-moe', column: 'embedding_nomic2', dim: 768 },
];

const textColumn = TABLE === 'conversations' ? 'reply_text' : 'text';

async function embed(model, text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status} for ${model}`);
  const data = await res.json();
  return data.embedding;
}

async function embedModel(modelInfo) {
  const { name, column } = modelInfo;
  console.log(`\n=== ${name} → ${TABLE}.${column} ===`);

  const totalRes = await pool.query(`
    SELECT COUNT(*) FROM ${TABLE}
    WHERE ${textColumn} IS NOT NULL AND LENGTH(${textColumn}) > 0 AND ${column} IS NULL
  `);
  const total = parseInt(totalRes.rows[0].count);
  console.log(`  To embed: ${total}`);
  if (total === 0) { console.log('  Already done!'); return; }

  let embedded = 0, errors = 0;
  const failedIds = new Set();
  const startTime = Date.now();

  while (true) {
    const excludeClause = failedIds.size > 0
      ? ` AND id NOT IN (${[...failedIds].map((_, i) => `$${i + 2}`).join(',')})`
      : '';
    const params = [BATCH_SIZE, ...(failedIds.size > 0 ? [...failedIds] : [])];

    const batch = await pool.query(`
      SELECT id, ${textColumn} as text FROM ${TABLE}
      WHERE ${textColumn} IS NOT NULL AND LENGTH(${textColumn}) > 0 AND ${column} IS NULL${excludeClause}
      LIMIT $1
    `, params);

    if (batch.rows.length === 0) break;

    for (let i = 0; i < batch.rows.length; i += CONCURRENCY) {
      const chunk = batch.rows.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (row) => {
        try {
          const vec = await embed(name, row.text);
          await pool.query(`UPDATE ${TABLE} SET ${column} = $1 WHERE id = $2`, [`[${vec}]`, row.id]);
          embedded++;
        } catch (err) {
          errors++;
          failedIds.add(row.id);
        }
      }));
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = (embedded / (elapsed || 1)).toFixed(1);
    console.log(`  ${embedded}/${total} (${errors} errors, ${elapsed}s, ${rate}/s)`);
    await new Promise(r => setTimeout(r, 100));
  }

  if (failedIds.size > 0) {
    console.log(`  Skipped ${failedIds.size} permanently failed rows`);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`  Done: ${embedded} embedded in ${elapsed}s (${errors} errors)`);
}

async function main() {
  const modelsToRun = MODEL_ARG === 'all'
    ? MODELS
    : MODELS.filter(m => m.name.includes(MODEL_ARG) || m.column.includes(MODEL_ARG));

  if (modelsToRun.length === 0) {
    console.error(`No model matching "${MODEL_ARG}". Available: ${MODELS.map(m => m.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Multi-Model Embedding — ${TABLE}`);
  console.log(`Models: ${modelsToRun.map(m => m.name).join(', ')}`);
  console.log(`Batch: ${BATCH_SIZE}, Concurrency: ${CONCURRENCY}`);

  for (const model of modelsToRun) {
    await embedModel(model);
  }

  console.log('\nAll models complete!');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
