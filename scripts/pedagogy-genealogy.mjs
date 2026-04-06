/**
 * pedagogy-genealogy.mjs — Build a pedagogy genealogy from @maybe_foucault's posts
 *
 * Scans all posts for pedagogical topic mentions (keyword regex), then uses
 * vector similarity to discover additional pedagogical posts that don't match
 * exact keywords. Builds temporal graph of topic occurrences and co-occurrence edges.
 *
 * Usage: node scripts/pedagogy-genealogy.mjs
 */

import { loadEnvIntoProcess } from './lib/threads-api.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.resolve(__dirname, '..'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

// ─── Pedagogy topic detection ────────────────────────────────────

const PEDAGOGY_TOPICS = {
  // Teaching methods
  'mentorship': /\bmentor\b|mentee|apprentice/i,
  'scaffolding': /\bscaffold/i,
  'socratic': /\bsocratic\b|asking.?question/i,
  'learning-by-doing': /\blearn.?by.?doing\b|hands.?on|practice/i,
  'analogy': /\banalog\b|metaphor|like.?a\b/i,
  'storytelling': /\bstory\b|narrative|tell.?you/i,
  'simplification': /\bsimplif\b|eli5|explain.?like|dumb.?down|tldr/i,
  'abstraction': /\babstract\b|mental.?model/i,
  'first-principles': /\bfirst.?principle\b|from.?scratch|foundational/i,

  // Knowledge concepts
  'epistemology': /\bepistem\b|knowledge.?work|ways.?of.?knowing/i,
  'genealogy': /\bgenealog\b|foucault|archaeology.?of/i,
  'episteme': /\bepisteme\b/i,
  'taxonomy': /\btaxonom\b|classif\b|categoriz/i,
  'interdisciplinary': /\binterdisciplin\b|multidisciplin\b|cross.?domain/i,
  'complexity': /\bcomplex\b|emergence|system.?think/i,

  // Learning stages
  'beginner': /\bbeginner\b|newbie|start.?coding|hello.?world|first.?time/i,
  'intermediate': /\bintermediate\b|level.?up|next.?step/i,
  'mastery': /\bmaster\b|expert|deep.?knowledge|fluency/i,
  'unlearning': /\bunlearn\b|paradigm.?shift|rethink/i,

  // Teaching contexts
  'code-review': /\bcode.?review\b|roast.?my|critique/i,
  'debugging': /\bdebug\b|troubleshoot|diagnos/i,
  'reading': /\bread\b.*\bbook\b|\bbook\b.*\bread\b|recommend.?read|must.?read/i,
  'curriculum': /\bcurriculum\b|syllabus|roadmap|path/i,
  'assessment': /\bassess\b|quiz|test|grade/i,

  // Pedagogical philosophy
  'accessibility': /\baccessib\b|inclusive|for.?everyone/i,
  'spoon-theory': /\bspoon\b|energy.?management|adhd/i,
  'grade-levels': /\bgrade\b.*\bgrader\b|\d+th.?grader/i,
  'empathy': /\bempathy\b|understand.?where|meet.?them/i,
  'patience': /\bpatien\b/i,
  'curiosity': /\bcuriou\b|wonder|explore/i,
};

const BATCH_SIZE = 1000;
const VECTOR_SEED_COUNT = 5;
const VECTOR_NEIGHBORS = 50;
const VECTOR_THRESHOLD = 0.5;

// ─── Schema ─────────────────────────────────────────────────────

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedagogy_genealogy (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      UNIQUE(post_id, topic)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ped_gen_topic ON pedagogy_genealogy(topic)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ped_gen_ts ON pedagogy_genealogy(timestamp)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedagogy_genealogy_edges (
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
  for (const [topic, regex] of Object.entries(PEDAGOGY_TOPICS)) {
    if (regex.test(text)) found.push(topic);
  }
  return found;
}

// ─── Main pipeline ──────────────────────────────────────────────

async function run() {
  console.log('Pedagogy Genealogy Pipeline');
  console.log('===========================\n');

  await ensureSchema();

  // Clear previous data for a clean rebuild
  await pool.query('DELETE FROM pedagogy_genealogy_edges');
  await pool.query('DELETE FROM pedagogy_genealogy');
  console.log('Cleared previous pedagogy genealogy data.\n');

  // ─── Phase 1: Keyword extraction ─────────────────────────────

  console.log('Phase 1: Keyword-based topic extraction');
  console.log('─'.repeat(50));

  const countRes = await pool.query('SELECT COUNT(*) FROM posts WHERE text IS NOT NULL');
  const totalPosts = parseInt(countRes.rows[0].count, 10);
  console.log(`Scanning ${totalPosts} posts for pedagogy topics...\n`);

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
            `INSERT INTO pedagogy_genealogy (post_id, topic, timestamp)
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

  // ─── Phase 2: Vector-based discovery ──────────────────────────

  console.log('Phase 2: Vector-based discovery');
  console.log('─'.repeat(50));

  // Pick seed posts: keyword matches with highest word count (long pedagogical posts)
  const seedRows = await pool.query(`
    SELECT DISTINCT ON (g.post_id) g.post_id, p.text, p.timestamp,
           LENGTH(p.text) as text_len
    FROM pedagogy_genealogy g
    JOIN posts p ON p.id = g.post_id
    WHERE p.embedding IS NOT NULL AND p.text IS NOT NULL
    ORDER BY g.post_id, LENGTH(p.text) DESC
  `);

  // Deduplicate and sort by text length descending, pick top N
  const seedsByLen = seedRows.rows
    .sort((a, b) => b.text_len - a.text_len)
    .slice(0, VECTOR_SEED_COUNT);

  if (seedsByLen.length === 0) {
    console.log('  No seed posts with embeddings found. Skipping vector discovery.\n');
  } else {
    console.log(`  Using ${seedsByLen.length} seed posts for vector similarity search...`);

    let vectorDiscovered = 0;
    const existingPostIds = new Set(
      (await pool.query('SELECT DISTINCT post_id FROM pedagogy_genealogy')).rows.map(r => r.post_id)
    );

    for (const seed of seedsByLen) {
      console.log(`  Seed: ${seed.post_id} (${seed.text_len} chars) — "${seed.text.slice(0, 60)}..."`);

      const neighbors = await pool.query(`
        SELECT p.id, p.text, p.timestamp,
               1 - (p.embedding <=> seed.embedding) as similarity
        FROM posts p, (SELECT embedding FROM posts WHERE id = $1) seed
        WHERE p.embedding IS NOT NULL AND p.id != $1
        ORDER BY p.embedding <=> seed.embedding
        LIMIT $2
      `, [seed.post_id, VECTOR_NEIGHBORS]);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const neighbor of neighbors.rows) {
          if (neighbor.similarity < VECTOR_THRESHOLD) continue;
          if (existingPostIds.has(neighbor.id)) continue;

          await client.query(
            `INSERT INTO pedagogy_genealogy (post_id, topic, timestamp)
             VALUES ($1, $2, $3)
             ON CONFLICT (post_id, topic) DO NOTHING`,
            [neighbor.id, 'vector-discovered', neighbor.timestamp]
          );
          existingPostIds.add(neighbor.id);
          vectorDiscovered++;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`  Vector discovery added ${vectorDiscovered} posts.\n`);
    totalInserted += vectorDiscovered;
  }

  // ─── Phase 3: Compute edges ───────────────────────────────────

  console.log('Phase 3: Computing co-occurrence edges');
  console.log('─'.repeat(50));

  // Same-post co-occurrences
  await pool.query(`
    INSERT INTO pedagogy_genealogy_edges (source_topic, target_topic, co_occurrence_count, first_seen, last_seen)
    SELECT a.topic, b.topic, COUNT(*), MIN(a.timestamp), MAX(a.timestamp)
    FROM pedagogy_genealogy a
    JOIN pedagogy_genealogy b ON a.post_id = b.post_id AND a.topic < b.topic
    GROUP BY a.topic, b.topic
    ON CONFLICT (source_topic, target_topic)
    DO UPDATE SET
      co_occurrence_count = EXCLUDED.co_occurrence_count,
      first_seen = LEAST(pedagogy_genealogy_edges.first_seen, EXCLUDED.first_seen),
      last_seen = GREATEST(pedagogy_genealogy_edges.last_seen, EXCLUDED.last_seen)
  `);
  console.log('  Same-post co-occurrences done.');

  // 24-hour window co-occurrences (different posts)
  await pool.query(`
    INSERT INTO pedagogy_genealogy_edges (source_topic, target_topic, co_occurrence_count, first_seen, last_seen)
    SELECT a.topic, b.topic, COUNT(DISTINCT (a.post_id, b.post_id)),
           MIN(LEAST(a.timestamp, b.timestamp)), MAX(GREATEST(a.timestamp, b.timestamp))
    FROM pedagogy_genealogy a
    JOIN pedagogy_genealogy b ON a.topic < b.topic
      AND a.post_id != b.post_id
      AND ABS(EXTRACT(EPOCH FROM a.timestamp - b.timestamp)) <= 86400
    WHERE NOT EXISTS (
      SELECT 1 FROM pedagogy_genealogy c
      JOIN pedagogy_genealogy d ON c.post_id = d.post_id AND c.topic = a.topic AND d.topic = b.topic
      WHERE c.post_id = a.post_id OR c.post_id = b.post_id
    )
    GROUP BY a.topic, b.topic
    ON CONFLICT (source_topic, target_topic)
    DO UPDATE SET
      co_occurrence_count = pedagogy_genealogy_edges.co_occurrence_count + EXCLUDED.co_occurrence_count,
      first_seen = LEAST(pedagogy_genealogy_edges.first_seen, EXCLUDED.first_seen),
      last_seen = GREATEST(pedagogy_genealogy_edges.last_seen, EXCLUDED.last_seen)
  `);
  console.log('  24-hour window co-occurrences done.\n');

  // ─── Summary ──────────────────────────────────────────────────

  const topTopics = await pool.query(`
    SELECT topic, COUNT(*) as mentions,
           MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
    FROM pedagogy_genealogy
    GROUP BY topic ORDER BY mentions DESC LIMIT 20
  `);

  console.log('Top 20 pedagogy topics by frequency:');
  console.log('─'.repeat(60));
  for (const r of topTopics.rows) {
    const first = r.first_seen.toISOString().slice(0, 10);
    const last = r.last_seen.toISOString().slice(0, 10);
    console.log(`  ${r.topic.padEnd(24)} ${String(r.mentions).padStart(5)} mentions  (${first} -> ${last})`);
  }

  const topEdges = await pool.query(`
    SELECT source_topic, target_topic, co_occurrence_count
    FROM pedagogy_genealogy_edges
    ORDER BY co_occurrence_count DESC LIMIT 10
  `);

  console.log('\nTop 10 topic pairs by co-occurrence:');
  console.log('─'.repeat(60));
  for (const r of topEdges.rows) {
    console.log(`  ${r.source_topic} <-> ${r.target_topic}  (${r.co_occurrence_count}x)`);
  }

  const totalTopics = await pool.query('SELECT COUNT(DISTINCT topic) FROM pedagogy_genealogy');
  const totalEdges = await pool.query('SELECT COUNT(*) FROM pedagogy_genealogy_edges');
  const vectorCount = await pool.query("SELECT COUNT(*) FROM pedagogy_genealogy WHERE topic = 'vector-discovered'");
  console.log(`\nTotal: ${totalTopics.rows[0].count} unique topics, ${totalInserted} mentions, ${totalEdges.rows[0].count} edges.`);
  console.log(`Vector-discovered posts: ${vectorCount.rows[0].count}`);

  await pool.end();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
