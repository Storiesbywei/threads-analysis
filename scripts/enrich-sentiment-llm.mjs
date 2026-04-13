/**
 * enrich-sentiment-llm.mjs — Re-score sentiment using Gemma 4 via Ollama
 *
 * The original enrich-posts.mjs uses a 39-word bag-of-words heuristic that
 * scores 71% of posts as 0.0. This script uses Gemma to actually understand
 * tone, sarcasm, enthusiasm, and casual language.
 *
 * Batches 10 posts per Gemma call to minimize overhead.
 *
 * Usage:
 *   node scripts/enrich-sentiment-llm.mjs                    # only re-score 0.0 posts
 *   node scripts/enrich-sentiment-llm.mjs --all              # re-score everything
 *   node scripts/enrich-sentiment-llm.mjs --batch-size=20    # bigger batches
 *   node scripts/enrich-sentiment-llm.mjs --dry-run          # preview without updating
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const GEMMA_MODEL = 'gemma4:e4b';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

// Parse args
const args = {};
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    args[k] = v || 'true';
  }
}

const BATCH_SIZE = parseInt(args['batch-size'] || '10', 10);
const ALL = args.all === 'true';
const DRY_RUN = args['dry-run'] === 'true';

async function askGemma(prompt) {
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 300 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
  const data = await resp.json();
  return data.message.content.trim();
}

function parseSentiments(response, ids) {
  // Parse "ID: score" lines from Gemma's response
  const results = new Map();
  const lines = response.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\d+)\s*[:)]\s*([-+]?\d*\.?\d+)/);
    if (match) {
      const idx = parseInt(match[1], 10);
      let score = parseFloat(match[2]);
      score = Math.max(-1, Math.min(1, score));
      if (idx >= 1 && idx <= ids.length) {
        results.set(ids[idx - 1], score);
      }
    }
  }
  return results;
}

async function main() {
  console.log('Sentiment Re-Scoring — Gemma 4');
  console.log('='.repeat(40));
  console.log(`Mode: ${ALL ? 'ALL posts' : 'only sentiment=0 posts'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log();

  // Count posts to process
  const where = ALL
    ? "text IS NOT NULL AND LENGTH(text) > 5"
    : "text IS NOT NULL AND LENGTH(text) > 5 AND (sentiment = 0 OR sentiment IS NULL)";

  const countRes = await pool.query(`SELECT COUNT(*) FROM posts WHERE ${where}`);
  const total = parseInt(countRes.rows[0].count, 10);
  console.log(`Posts to score: ${total}`);

  if (total === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  const startTime = Date.now();

  while (processed < total) {
    // Fetch batch
    const batch = await pool.query(
      `SELECT id, LEFT(text, 200) AS text FROM posts
       WHERE ${where}
       ORDER BY timestamp DESC
       OFFSET $1 LIMIT $2`,
      [processed, BATCH_SIZE]
    );

    if (batch.rows.length === 0) break;

    const ids = batch.rows.map(r => r.id);
    const posts = batch.rows.map((r, i) => `${i + 1}) ${r.text}`).join('\n');

    const prompt = `Score the sentiment of each social media post from -1.0 (very negative) to +1.0 (very positive). 0.0 means truly neutral.

Consider tone, sarcasm, enthusiasm, slang, and context. Examples:
- "It's sooooo good" → 0.8 (enthusiastic positive)
- "That's doooope" → 0.7 (casual positive)
- "lol. So you don't have a plan." → -0.3 (mocking/dismissive)
- "Aww thank you" → 0.6 (warm positive)
- "Yeah that's a no for me dawg" → -0.2 (casual rejection)
- "The algorithm is broken again" → -0.4 (frustrated)

Posts:
${posts}

Respond with ONLY numbered scores, one per line (e.g., "1: 0.7"). No explanations.`;

    try {
      const response = await askGemma(prompt);
      const scores = parseSentiments(response, ids);

      if (!DRY_RUN) {
        for (const [id, score] of scores) {
          await pool.query('UPDATE posts SET sentiment = $1 WHERE id = $2', [score, id]);
          updated++;
        }
      }

      // Show sample
      if (processed < 30 || processed % 500 === 0) {
        for (const [i, row] of batch.rows.entries()) {
          const score = scores.get(row.id);
          if (score !== undefined && i < 3) {
            console.log(`  [${score >= 0 ? '+' : ''}${score.toFixed(1)}] ${row.text.slice(0, 60)}`);
          }
        }
      }

      processed += batch.rows.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / (elapsed || 1)).toFixed(1);
      process.stdout.write(`\r  ${processed}/${total} (${rate}/s, ${updated} updated, ${errors} errors)`);

    } catch (err) {
      errors++;
      console.error(`\n  Batch error: ${err.message}`);
      processed += batch.rows.length;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n\n${'='.repeat(40)}`);
  console.log(`Done in ${elapsed}s`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);

  // Also update cluster-level sentiment averages
  if (!DRY_RUN && updated > 0) {
    console.log('\nUpdating cluster sentiment averages...');
    await pool.query(`
      UPDATE embedding_clusters ec SET avg_sentiment = sub.avg_s
      FROM (
        SELECT pc.cluster_id, pc.model, ROUND(AVG(p.sentiment)::numeric, 3) AS avg_s
        FROM post_clusters pc
        JOIN posts p ON p.id = pc.post_id
        WHERE p.sentiment IS NOT NULL AND pc.cluster_id >= 0
        GROUP BY pc.cluster_id, pc.model
      ) sub
      WHERE ec.cluster_id = sub.cluster_id AND ec.model = sub.model
    `);
    console.log('  Cluster averages updated.');

    // Update palace wing metadata
    await pool.query(`
      UPDATE tp_nodes SET metadata = jsonb_set(metadata, '{avg_sentiment}',
        to_jsonb((SELECT ROUND(AVG(p.sentiment)::numeric, 3)
         FROM post_clusters pc
         JOIN posts p ON p.id = pc.post_id
         WHERE pc.cluster_id = (tp_nodes.metadata->>'cluster_id')::int
           AND pc.model = tp_nodes.metadata->>'model'
           AND p.sentiment IS NOT NULL
        ))
      )
      WHERE node_type = 'wing' AND metadata ? 'cluster_id'
    `);
    console.log('  Palace wing sentiment updated.');
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
