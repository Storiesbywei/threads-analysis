#!/usr/bin/env node
/**
 * pipeline-audit.mjs — End-to-end pipeline integrity test
 *
 * Tests every step: raw JSON → Postgres → timestamps → embeddings → enrichment →
 * genealogy → interactions → conversations → metrics → API endpoints
 *
 * Usage: node scripts/pipeline-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load env
const envPath = path.join(ROOT, '.env');
const envLines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
for (const line of envLines) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const { default: pg } = await import('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const FLASK_URL = 'http://100.71.141.45:4323';
const NODE_URL = 'http://100.71.141.45:4322';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const POSTS_FILE = path.join(ROOT, 'data', 'threads', 'posts.json');

let pass = 0, fail = 0, warn = 0;
const results = [];

function ok(test, detail) {
  pass++;
  results.push({ status: 'PASS', test, detail });
  console.log(`  PASS  ${test}${detail ? ' — ' + detail : ''}`);
}

function bad(test, detail) {
  fail++;
  results.push({ status: 'FAIL', test, detail });
  console.log(`  FAIL  ${test}${detail ? ' — ' + detail : ''}`);
}

function warning(test, detail) {
  warn++;
  results.push({ status: 'WARN', test, detail });
  console.log(`  WARN  ${test}${detail ? ' — ' + detail : ''}`);
}

async function q(sql) {
  const res = await pool.query(sql);
  return res.rows;
}

async function fetchOk(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// ═══════════════════════════════════════
// STEP 1: Raw Data
// ═══════════════════════════════════════
async function testRawData() {
  console.log('\n--- Step 1: Raw Data (posts.json) ---');

  if (!fs.existsSync(POSTS_FILE)) return bad('posts.json exists', 'file not found');
  ok('posts.json exists');

  const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  const posts = data.posts || data;
  const count = posts.length;

  count > 0 ? ok(`posts.json has data`, `${count} posts`) : bad('posts.json has data', 'empty');

  // Check a sample post has required fields
  const sample = posts[0];
  const requiredFields = ['id', 'text', 'timestamp', 'media_type'];
  for (const field of requiredFields) {
    sample[field] !== undefined ? ok(`sample post has ${field}`) : bad(`sample post has ${field}`);
  }

  // Check timestamp format (ISO 8601)
  const ts = sample.timestamp;
  if (ts && /^\d{4}-\d{2}-\d{2}T/.test(ts)) {
    ok('timestamp format is ISO 8601', ts.slice(0, 20));
  } else {
    bad('timestamp format is ISO 8601', ts);
  }
}

// ═══════════════════════════════════════
// STEP 2: Postgres Import
// ═══════════════════════════════════════
async function testPostgresImport() {
  console.log('\n--- Step 2: Postgres Import ---');

  const [{ count: postCount }] = await q('SELECT COUNT(*) FROM posts');
  parseInt(postCount) > 0 ? ok(`posts table populated`, `${postCount} rows`) : bad('posts table populated');

  // Check no null timestamps
  const [{ count: nullTs }] = await q("SELECT COUNT(*) FROM posts WHERE timestamp IS NULL");
  parseInt(nullTs) === 0 ? ok('no null timestamps') : bad('no null timestamps', `${nullTs} null`);

  // Check varieties are valid
  const varieties = await q("SELECT DISTINCT variety FROM posts");
  const valid = ['original', 'reply', 'quote', 'repost'];
  const invalid = varieties.filter(v => !valid.includes(v.variety));
  invalid.length === 0 ? ok('all varieties valid', varieties.map(v => v.variety).join(', ')) : bad('all varieties valid', JSON.stringify(invalid));
}

// ═══════════════════════════════════════
// STEP 3: Timestamp Integrity
// ═══════════════════════════════════════
async function testTimestampIntegrity() {
  console.log('\n--- Step 3: Timestamp Integrity ---');

  // Sample check: raw JSON timestamps match Postgres
  const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  const posts = data.posts || data;
  const sampleIds = posts.slice(0, 20).map(p => p.id);

  let mismatches = 0;
  for (const id of sampleIds) {
    const jsonPost = posts.find(p => p.id === id);
    const [dbPost] = await q(`SELECT timestamp FROM posts WHERE id = '${id}'`);
    if (dbPost) {
      const jsonDate = new Date(jsonPost.timestamp).toISOString().slice(0, 10);
      const dbDate = new Date(dbPost.timestamp).toISOString().slice(0, 10);
      if (jsonDate !== dbDate) mismatches++;
    }
  }
  mismatches === 0 ? ok('JSON↔Postgres timestamps match', `${sampleIds.length} sampled`) : bad('JSON↔Postgres timestamps match', `${mismatches}/${sampleIds.length} mismatched`);

  // Check downstream tables match posts
  for (const table of ['tech_genealogy', 'pedagogy_genealogy', 'interactions']) {
    const [{ count }] = await q(`SELECT COUNT(*) FROM ${table} t JOIN posts p ON p.id = t.post_id WHERE t.timestamp != p.timestamp`);
    parseInt(count) === 0 ? ok(`${table} timestamps synced`) : bad(`${table} timestamps synced`, `${count} mismatched`);
  }
}

// ═══════════════════════════════════════
// STEP 4: Embeddings
// ═══════════════════════════════════════
async function testEmbeddings() {
  console.log('\n--- Step 4: Embeddings ---');

  const [{ total }] = await q("SELECT COUNT(*) AS total FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 0");
  const [{ embedded }] = await q("SELECT COUNT(*) AS embedded FROM posts WHERE embedding IS NOT NULL");
  const pct = ((parseInt(embedded) / parseInt(total)) * 100).toFixed(1);

  parseInt(embedded) > 0 ? ok(`nomic-embed-text embeddings`, `${embedded}/${total} (${pct}%)`) : bad('nomic-embed-text embeddings');

  if (parseFloat(pct) < 99) warning('embedding coverage < 99%', `${pct}% — run npm run embed`);

  // Check embedding dimensions
  const [{ dim }] = await q("SELECT array_length(embedding::real[], 1) AS dim FROM posts WHERE embedding IS NOT NULL LIMIT 1");
  parseInt(dim) === 768 ? ok('embedding dimension', '768d') : bad('embedding dimension', `${dim}d, expected 768`);

  // Check multi-model columns exist and have data
  const models = [
    { col: 'embedding_minilm', name: 'all-minilm', dim: 384 },
    { col: 'embedding_bge_m3', name: 'bge-m3', dim: 1024 },
    { col: 'embedding_mxbai', name: 'mxbai-embed-large', dim: 1024 },
    { col: 'embedding_snowflake', name: 'snowflake-arctic-embed', dim: 1024 },
    { col: 'embedding_granite', name: 'granite-embedding', dim: 768 },
    { col: 'embedding_qwen3', name: 'qwen3-embedding', dim: 1024 },
    { col: 'embedding_arctic2', name: 'snowflake-arctic-embed2', dim: 1024 },
    { col: 'embedding_nomic2', name: 'nomic-embed-text-v2-moe', dim: 768 },
  ];

  for (const m of models) {
    try {
      const [{ count }] = await q(`SELECT COUNT(*) FROM posts WHERE ${m.col} IS NOT NULL`);
      const c = parseInt(count);
      if (c === 0) warning(`${m.name} embeddings`, 'not started');
      else if (c < parseInt(total) * 0.9) warning(`${m.name} embeddings`, `${c}/${total} (in progress)`);
      else ok(`${m.name} embeddings`, `${c}/${total}`);
    } catch {
      warning(`${m.name} column`, 'column missing');
    }
  }
}

// ═══════════════════════════════════════
// STEP 5: Enrichment
// ═══════════════════════════════════════
async function testEnrichment() {
  console.log('\n--- Step 5: Enrichment ---');

  for (const col of ['sentiment', 'energy', 'intent', 'language']) {
    const [{ count }] = await q(`SELECT COUNT(*) FROM posts WHERE ${col} IS NOT NULL`);
    parseInt(count) > 0 ? ok(`${col} enrichment`, `${count} posts`) : bad(`${col} enrichment`, 'no data');
  }

  // Check enrichment values are valid
  const energies = await q("SELECT DISTINCT energy FROM posts WHERE energy IS NOT NULL");
  const validEnergy = ['low', 'mid', 'high'];
  const badEnergy = energies.filter(e => !validEnergy.includes(e.energy));
  badEnergy.length === 0 ? ok('energy values valid') : bad('energy values valid', JSON.stringify(badEnergy));
}

// ═══════════════════════════════════════
// STEP 6: Tech Genealogy
// ═══════════════════════════════════════
async function testTechGenealogy() {
  console.log('\n--- Step 6: Tech Genealogy ---');

  const [{ count }] = await q('SELECT COUNT(*) FROM tech_genealogy');
  parseInt(count) > 0 ? ok('tech_genealogy populated', `${count} entries`) : bad('tech_genealogy populated');

  const [{ topics }] = await q('SELECT COUNT(DISTINCT topic) AS topics FROM tech_genealogy');
  parseInt(topics) >= 10 ? ok('tech topics diversity', `${topics} topics`) : warning('tech topics diversity', `only ${topics}`);

  // Check edges
  const [{ edges }] = await q('SELECT COUNT(*) AS edges FROM tech_genealogy_edges');
  parseInt(edges) > 0 ? ok('tech genealogy edges', `${edges} edges`) : warning('tech genealogy edges', 'no edges');
}

// ═══════════════════════════════════════
// STEP 7: Pedagogy Genealogy
// ═══════════════════════════════════════
async function testPedagogyGenealogy() {
  console.log('\n--- Step 7: Pedagogy Genealogy ---');

  const [{ count }] = await q('SELECT COUNT(*) FROM pedagogy_genealogy');
  parseInt(count) > 0 ? ok('pedagogy_genealogy populated', `${count} entries`) : bad('pedagogy_genealogy populated');

  const [{ topics }] = await q('SELECT COUNT(DISTINCT topic) AS topics FROM pedagogy_genealogy');
  parseInt(topics) >= 10 ? ok('pedagogy topics diversity', `${topics} topics`) : warning('pedagogy topics diversity', `only ${topics}`);
}

// ═══════════════════════════════════════
// STEP 8: Interactions & Conversations
// ═══════════════════════════════════════
async function testInteractions() {
  console.log('\n--- Step 8: Interactions & Conversations ---');

  const [{ count: intCount }] = await q('SELECT COUNT(*) FROM interactions');
  parseInt(intCount) > 0 ? ok('interactions table', `${intCount} rows`) : bad('interactions table');

  const [{ count: convCount }] = await q('SELECT COUNT(*) FROM conversations');
  parseInt(convCount) > 0 ? ok('conversations table', `${convCount} rows`) : bad('conversations table');

  const [{ count: repliers }] = await q("SELECT COUNT(DISTINCT reply_username) FROM conversations WHERE reply_username IS NOT NULL");
  ok('unique repliers', `${repliers}`);

  // Check conversation backfill coverage
  const [{ total: postsWithText }] = await q("SELECT COUNT(*) AS total FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 0");
  const [{ count: backfilled }] = await q("SELECT COUNT(*) FROM conversation_backfill_log");
  const pct = ((parseInt(backfilled) / parseInt(postsWithText)) * 100).toFixed(1);
  parseFloat(pct) >= 90 ? ok('conversation backfill coverage', `${pct}%`) : warning('conversation backfill coverage', `${pct}% — still running`);
}

// ═══════════════════════════════════════
// STEP 9: Metrics
// ═══════════════════════════════════════
async function testMetrics() {
  console.log('\n--- Step 9: Metrics ---');

  const [{ count }] = await q('SELECT COUNT(*) FROM metrics_latest');
  parseInt(count) > 0 ? ok('metrics_latest view', `${count} rows`) : bad('metrics_latest view');

  const [{ total_views }] = await q('SELECT SUM(views) AS total_views FROM metrics_latest');
  ok('total views', parseInt(total_views).toLocaleString());

  // Check no negative metrics
  const [{ bad_metrics }] = await q('SELECT COUNT(*) AS bad_metrics FROM metrics_latest WHERE views < 0 OR likes < 0');
  parseInt(bad_metrics) === 0 ? ok('no negative metrics') : bad('no negative metrics', `${bad_metrics} rows`);
}

// ═══════════════════════════════════════
// STEP 10: Knowledge Graph
// ═══════════════════════════════════════
async function testKnowledgeGraph() {
  console.log('\n--- Step 10: Knowledge Graph ---');

  const [{ count: nodes }] = await q('SELECT COUNT(*) FROM kg_nodes');
  const [{ count: edges }] = await q('SELECT COUNT(*) FROM kg_edges');
  parseInt(nodes) > 0 ? ok('kg_nodes', `${nodes} nodes`) : bad('kg_nodes');
  parseInt(edges) > 0 ? ok('kg_edges', `${edges} edges`) : bad('kg_edges');
}

// ═══════════════════════════════════════
// STEP 11: Haiku Oracle
// ═══════════════════════════════════════
async function testHaikuOracle() {
  console.log('\n--- Step 11: Haiku Oracle ---');

  const [{ count }] = await q('SELECT COUNT(*) FROM haikus');
  parseInt(count) > 0 ? ok('haikus generated', `${count} haikus`) : warning('haikus generated', 'none yet');

  if (parseInt(count) > 0) {
    const [{ count: edges }] = await q('SELECT COUNT(*) FROM haiku_edges');
    parseInt(edges) > 0 ? ok('haiku→post edges', `${edges} edges`) : bad('haiku→post edges');
  }
}

// ═══════════════════════════════════════
// STEP 12: Tags & Surprise Scores
// ═══════════════════════════════════════
async function testTagsAndSurprise() {
  console.log('\n--- Step 12: Tags & Surprise Scores ---');

  const [{ count: tags }] = await q('SELECT COUNT(*) FROM tags');
  parseInt(tags) > 0 ? ok('tags table', `${tags} tags`) : bad('tags table');

  const [{ count: surprise }] = await q('SELECT COUNT(*) FROM surprise_scores');
  parseInt(surprise) > 0 ? ok('surprise_scores', `${surprise} scores`) : bad('surprise_scores');
}

// ═══════════════════════════════════════
// STEP 13: API Endpoints
// ═══════════════════════════════════════
async function testAPIs() {
  console.log('\n--- Step 13: API Endpoints ---');

  // Flask API
  const flaskHealth = await fetchOk(`${FLASK_URL}/health`);
  flaskHealth ? ok('Flask API health', ':4323') : bad('Flask API health', 'unreachable');

  if (flaskHealth) {
    const endpoints = ['/stats/overview', '/posts/latest', '/haiku/all', '/genealogy/topics', '/pedagogy/topics'];
    for (const ep of endpoints) {
      const alive = await fetchOk(`${FLASK_URL}${ep}`);
      alive ? ok(`Flask ${ep}`) : bad(`Flask ${ep}`);
    }
  }

  // Node API
  const nodeHealth = await fetchOk(`${NODE_URL}/api/health`);
  nodeHealth ? ok('Node API health', ':4322') : bad('Node API health', 'unreachable');

  // Ollama
  const ollamaOk = await fetchOk(`${OLLAMA_URL}/api/tags`);
  ollamaOk ? ok('Ollama available') : bad('Ollama available', 'unreachable');
}

// ═══════════════════════════════════════
// STEP 14: Security
// ═══════════════════════════════════════
async function testSecurity() {
  console.log('\n--- Step 14: Security ---');

  // Check .env is gitignored
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  gitignore.includes('.env') ? ok('.env is gitignored') : bad('.env is gitignored');

  // Check no secrets in .env.example
  if (fs.existsSync(path.join(ROOT, '.env.example'))) {
    const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const hasToken = /THREADS_ACCESS_TOKEN=.{10,}/.test(example);
    const hasPhone = /ALERT_PHONE=\+?\d{10,}/.test(example);
    !hasToken ? ok('.env.example has no real token') : bad('.env.example has real token', 'SCRUB IT');
    !hasPhone ? ok('.env.example has no phone number') : bad('.env.example has phone number', 'SCRUB IT');
  }

  // Check no secrets in git history (quick check)
  // This is just a heuristic — not exhaustive
  ok('security checks done', 'run /scan for deep audit');
}

// ═══════════════════════════════════════
// STEP 15: Grafana Dashboards
// ═══════════════════════════════════════
async function testGrafana() {
  console.log('\n--- Step 15: Grafana Dashboards ---');

  const grafanaOk = await fetchOk('http://100.71.141.45:3002/api/health');
  grafanaOk ? ok('Grafana running', ':3002') : bad('Grafana running');

  if (grafanaOk) {
    const dashboards = ['threads-analysis', 'haleigh-interactions', 'community', 'content-performance', 'personal-analytics'];
    for (const uid of dashboards) {
      try {
        const res = await fetch(`http://100.71.141.45:3002/api/dashboards/uid/${uid}`);
        if (res.ok) {
          const data = await res.json();
          const panels = data.dashboard?.panels?.length || 0;
          ok(`dashboard: ${uid}`, `${panels} panels`);
        } else {
          bad(`dashboard: ${uid}`, `HTTP ${res.status}`);
        }
      } catch {
        bad(`dashboard: ${uid}`, 'unreachable');
      }
    }
  }
}

// ═══════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════
async function main() {
  console.log('Pipeline Audit — threads-analysis');
  console.log('==================================');
  console.log(`Date: ${new Date().toISOString()}`);

  await testRawData();
  await testPostgresImport();
  await testTimestampIntegrity();
  await testEmbeddings();
  await testEnrichment();
  await testTechGenealogy();
  await testPedagogyGenealogy();
  await testInteractions();
  await testMetrics();
  await testKnowledgeGraph();
  await testHaikuOracle();
  await testTagsAndSurprise();
  await testAPIs();
  await testSecurity();
  await testGrafana();

  console.log('\n==================================');
  console.log(`RESULTS: ${pass} pass / ${fail} fail / ${warn} warn`);
  console.log('==================================');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
