/**
 * add-vector-column.mjs — Enable pgvector and add embedding column to posts
 */

import { loadEnvIntoProcess } from './lib/threads-api.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.resolve(__dirname, '..'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const client = new pg.Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  console.log('Connected to Postgres');

  console.log('Creating pgvector extension...');
  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

  console.log('Adding embedding column (vector(768))...');
  await client.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS embedding vector(768);');

  console.log('Creating IVFFlat index...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_posts_embedding
    ON posts USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  `);

  console.log('Done. pgvector is ready.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
