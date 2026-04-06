/**
 * tech-genealogy.mjs — Build a technology genealogy from @maybe_foucault's posts
 *
 * Scans all posts for specific tech topic mentions, builds a temporal graph
 * of topic occurrences and co-occurrence edges.
 *
 * Usage: node scripts/tech-genealogy.mjs
 */

import { loadEnvIntoProcess } from './lib/threads-api.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.resolve(__dirname, '..'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

// ─── Tech topic detection ────────────────────────────────────────

const TECH_TOPICS = {
  // Languages & frameworks
  'swift': /\bswift\b/i, 'python': /\bpython\b/i, 'javascript': /\bjavascript\b|\.js\b/i,
  'typescript': /\btypescript\b|\.ts\b/i, 'react': /\breact\b/i, 'astro': /\bastro\b/i,
  'swiftui': /\bswiftui\b/i, 'flutter': /\bflutter\b/i, 'rust': /\brust\b/i,
  'css': /\bcss\b/i, 'html': /\bhtml\b/i, 'sql': /\bsql\b/i,

  // AI/ML
  'claude': /\bclaude\b/i, 'chatgpt': /\bchatgpt\b|gpt[-\s]?[34]/i, 'llm': /\bllm\b/i,
  'ollama': /\bollama\b/i, 'gemma': /\bgemma\b/i, 'gemini': /\bgemini\b/i,
  'stable-diffusion': /\bstable.?diffusion\b/i, 'whisper': /\bwhisper\b/i,
  'mlx': /\bmlx\b/i, 'transformer': /\btransformer\b/i,
  'embedding': /\bembedding\b/i, 'rag': /\brag\b/i,
  'agent': /\bagent\b/i, 'mcp': /\bmcp\b/i,

  // Platforms
  'ios': /\bios\b/i, 'visionos': /\bvisionos\b|vision\s*pro\b/i, 'macos': /\bmacos\b/i,
  'docker': /\bdocker\b/i, 'kubernetes': /\bkubernetes\b|k8s\b/i,
  'postgres': /\bpostgres\b|postgresql\b/i, 'redis': /\bredis\b/i,
  'tailscale': /\btailscale\b/i, 'vercel': /\bvercel\b/i,
  'xcode': /\bxcode\b/i, 'github': /\bgithub\b/i,

  // Concepts
  'api': /\bapi\b/i, 'openapi': /\bopenapi\b/i, 'rest': /\brest\b/i,
  'webxr': /\bwebxr\b|three\.js\b/i, 'ar': /\bar\b|augmented.?reality/i, 'vr': /\bvr\b|virtual.?reality/i,
  'blockchain': /\bblockchain\b|crypto\b/i,
  'shortcuts': /\bshortcuts?\b/i, 'automation': /\bautomation\b/i,
  'pgvector': /\bpgvector\b/i, 'vector-db': /\bvector.?db\b|vector.?database/i,

  // Hardware
  'apple-silicon': /\bm[1234]\b|apple.?silicon/i, 'raspberry-pi': /\braspberry\b|raspi\b/i,
  'mac-mini': /\bmac.?mini\b/i, 'iphone': /\biphone\b/i, 'ipad': /\bipad\b/i,
};

const BATCH_SIZE = 1000;

// ─── Schema ─────────────────────────────────────────────────────

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tech_genealogy (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      UNIQUE(post_id, topic)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_gen_topic ON tech_genealogy(topic)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_gen_ts ON tech_genealogy(timestamp)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tech_genealogy_edges (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      source_topic TEXT NOT NULL,
      target_topic TEXT NOT NULL,
      co_occurrence_count INT DEFAULT 1,
      first_seen TIMESTAMPTZ,
      last_seen TIMESTAMPTZ,
      UNIQUE(source_topic, target_topic)
    )
  `);
  console.log('Schema ready.');
}

// ─── Topic extraction ───────────────────────────────────────────

function extractTopics(text) {
  if (!text) return [];
  const found = [];
  for (const [topic, regex] of Object.entries(TECH_TOPICS)) {
    if (regex.test(text)) found.push(topic);
  }
  return found;
}

// ─── Main pipeline ──────────────────────────────────────────────

async function run() {
  console.log('Tech Genealogy Pipeline');
  console.log('=======================\n');

  await ensureSchema();

  // Clear previous data for a clean rebuild
  await pool.query('DELETE FROM tech_genealogy_edges');
  await pool.query('DELETE FROM tech_genealogy');
  console.log('Cleared previous genealogy data.\n');

  // Scan all posts with text
  const countRes = await pool.query('SELECT COUNT(*) FROM posts WHERE text IS NOT NULL');
  const totalPosts = parseInt(countRes.rows[0].count, 10);
  console.log(`Scanning ${totalPosts} posts for tech topics...\n`);

  let offset = 0;
  let totalInserted = 0;

  while (offset < totalPosts) {
    const { rows: posts } = await pool.query(
      'SELECT id, text, timestamp FROM posts WHERE text IS NOT NULL ORDER BY timestamp LIMIT $1 OFFSET $2',
      [BATCH_SIZE, offset]
    );
    if (posts.length === 0) break;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const post of posts) {
        const topics = extractTopics(post.text);
        for (const topic of topics) {
          await client.query(
            `INSERT INTO tech_genealogy (post_id, topic, timestamp)
             VALUES ($1, $2, $3)
             ON CONFLICT (post_id, topic) DO NOTHING`,
            [post.id, topic, post.timestamp]
          );
          totalInserted++;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    offset += posts.length;
    process.stdout.write(`\r  Processed ${offset}/${totalPosts} posts (${totalInserted} topic mentions)`);
  }
  console.log('\n');

  // ─── Compute edges ────────────────────────────────────────────

  console.log('Computing co-occurrence edges...');

  // 1) Same-post co-occurrences
  await pool.query(`
    INSERT INTO tech_genealogy_edges (source_topic, target_topic, co_occurrence_count, first_seen, last_seen)
    SELECT a.topic, b.topic, COUNT(*), MIN(a.timestamp), MAX(a.timestamp)
    FROM tech_genealogy a
    JOIN tech_genealogy b ON a.post_id = b.post_id AND a.topic < b.topic
    GROUP BY a.topic, b.topic
    ON CONFLICT (source_topic, target_topic)
    DO UPDATE SET
      co_occurrence_count = EXCLUDED.co_occurrence_count,
      first_seen = LEAST(tech_genealogy_edges.first_seen, EXCLUDED.first_seen),
      last_seen = GREATEST(tech_genealogy_edges.last_seen, EXCLUDED.last_seen)
  `);
  console.log('  Same-post co-occurrences done.');

  // 2) 24-hour window co-occurrences (different posts)
  await pool.query(`
    INSERT INTO tech_genealogy_edges (source_topic, target_topic, co_occurrence_count, first_seen, last_seen)
    SELECT a.topic, b.topic, COUNT(DISTINCT (a.post_id, b.post_id)),
           MIN(LEAST(a.timestamp, b.timestamp)), MAX(GREATEST(a.timestamp, b.timestamp))
    FROM tech_genealogy a
    JOIN tech_genealogy b ON a.topic < b.topic
      AND a.post_id != b.post_id
      AND ABS(EXTRACT(EPOCH FROM a.timestamp - b.timestamp)) <= 86400
    WHERE NOT EXISTS (
      SELECT 1 FROM tech_genealogy c
      JOIN tech_genealogy d ON c.post_id = d.post_id AND c.topic = a.topic AND d.topic = b.topic
      WHERE c.post_id = a.post_id OR c.post_id = b.post_id
    )
    GROUP BY a.topic, b.topic
    ON CONFLICT (source_topic, target_topic)
    DO UPDATE SET
      co_occurrence_count = tech_genealogy_edges.co_occurrence_count + EXCLUDED.co_occurrence_count,
      first_seen = LEAST(tech_genealogy_edges.first_seen, EXCLUDED.first_seen),
      last_seen = GREATEST(tech_genealogy_edges.last_seen, EXCLUDED.last_seen)
  `);
  console.log('  24-hour window co-occurrences done.\n');

  // ─── Summary ──────────────────────────────────────────────────

  const topTopics = await pool.query(`
    SELECT topic, COUNT(*) as mentions,
           MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
    FROM tech_genealogy
    GROUP BY topic ORDER BY mentions DESC LIMIT 20
  `);

  console.log('Top 20 topics by frequency:');
  console.log('─'.repeat(60));
  for (const r of topTopics.rows) {
    const first = r.first_seen.toISOString().slice(0, 10);
    const last = r.last_seen.toISOString().slice(0, 10);
    console.log(`  ${r.topic.padEnd(20)} ${String(r.mentions).padStart(5)} mentions  (${first} → ${last})`);
  }

  const topEdges = await pool.query(`
    SELECT source_topic, target_topic, co_occurrence_count
    FROM tech_genealogy_edges
    ORDER BY co_occurrence_count DESC LIMIT 10
  `);

  console.log('\nTop 10 topic pairs by co-occurrence:');
  console.log('─'.repeat(60));
  for (const r of topEdges.rows) {
    console.log(`  ${r.source_topic} <-> ${r.target_topic}  (${r.co_occurrence_count}x)`);
  }

  const totalTopics = await pool.query('SELECT COUNT(DISTINCT topic) FROM tech_genealogy');
  const totalEdges = await pool.query('SELECT COUNT(*) FROM tech_genealogy_edges');
  console.log(`\nTotal: ${totalTopics.rows[0].count} unique topics, ${totalInserted} mentions, ${totalEdges.rows[0].count} edges.`);

  await pool.end();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
