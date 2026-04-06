/**
 * embed-posts.mjs — Generate vector embeddings for posts using Ollama nomic-embed-text
 *
 * Processes posts that have text but no embedding, in batches of 10.
 * Usage: node scripts/embed-posts.mjs [--limit=1000]
 */

import { loadEnvIntoProcess, parseArgs, sleep } from './lib/threads-api.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.resolve(__dirname, '..'));

const args = parseArgs();
const BATCH_SIZE = 10;
const BATCH_DELAY = 100;
const LIMIT = args.limit || 1000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.embedding;
}

async function embedPost(id, text) {
  const embedding = await getEmbedding(text);
  const vecLiteral = '[' + embedding.join(',') + ']';
  await pool.query('UPDATE posts SET embedding = $1 WHERE id = $2', [vecLiteral, id]);
  return true;
}

async function main() {
  console.log(`Fetching up to ${LIMIT} posts without embeddings...`);

  const { rows } = await pool.query(
    'SELECT id, text FROM posts WHERE text IS NOT NULL AND embedding IS NULL LIMIT $1',
    [LIMIT]
  );

  console.log(`Found ${rows.length} posts to embed`);
  if (rows.length === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  let done = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async ({ id, text }) => {
        try {
          await embedPost(id, text);
          return true;
        } catch (err) {
          console.error(`  Error embedding ${id}: ${err.message}`);
          errors++;
          return false;
        }
      })
    );

    done += results.filter(Boolean).length;

    if (done % 100 === 0 || done === rows.length) {
      console.log(`Progress: ${done}/${rows.length} embedded (${errors} errors)`);
    }

    if (i + BATCH_SIZE < rows.length) {
      await sleep(BATCH_DELAY);
    }
  }

  console.log(`\nDone. Embedded ${done} posts (${errors} errors).`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
