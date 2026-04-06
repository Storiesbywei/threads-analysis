/**
 * add-enrichment-columns.mjs — Add enrichment columns to the posts table
 */

import { loadEnvIntoProcess } from './lib/threads-api.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.resolve(__dirname, '..'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

const SQL = `
-- Sentiment & energy (computed from text, no LLM needed)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS sentiment REAL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS energy TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thread_depth INT DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hour_bucket INT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_weekend BOOLEAN;

-- LLM-derived (batch overnight with Gemma 4)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS vibe TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS abstraction_level INT;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_posts_sentiment ON posts(sentiment) WHERE sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_energy ON posts(energy) WHERE energy IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_vibe ON posts(vibe) WHERE vibe IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_intent ON posts(intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_hour ON posts(hour_bucket);
`;

async function main() {
  console.log('Adding enrichment columns to posts table...');
  for (const stmt of SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    console.log(`  ${stmt.slice(0, 70)}...`);
    await pool.query(stmt);
  }
  console.log('Done. All enrichment columns added.');
  await pool.end();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
