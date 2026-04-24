#!/usr/bin/env node
/**
 * pipeline-validate.mjs — Validation checks for each pipeline stage
 *
 * Importable by pipeline.mjs or runnable standalone:
 *   node scripts/pipeline-validate.mjs              # validate all stages
 *   node scripts/pipeline-validate.mjs --stage=3    # validate clustering only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const { default: pg } = await import('pg');
let pool;
function getPool() {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function q(sql, params) {
  return (await getPool().query(sql, params || [])).rows;
}

async function count(sql, params) {
  const rows = await q(sql, params);
  return parseInt(rows[0].count, 10);
}

// ─── Validation result helpers ──────────────────────────────

function check(name, passed, detail) {
  return { name, pass: !!passed, detail };
}

// ─── Stage 1: Enrich ────────────────────────────────────────

export async function validateEnrich() {
  const checks = [];
  const totalText = await count("SELECT COUNT(*) FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 5");

  const sentimentCount = await count("SELECT COUNT(*) FROM posts WHERE sentiment IS NOT NULL");
  checks.push(check('sentiment populated', sentimentCount > 0, `${sentimentCount}/${totalText} posts`));

  const energyCount = await count("SELECT COUNT(*) FROM posts WHERE energy IS NOT NULL");
  checks.push(check('energy populated', energyCount > 0, `${energyCount}/${totalText} posts`));

  const intentCount = await count("SELECT COUNT(*) FROM posts WHERE intent IS NOT NULL");
  checks.push(check('intent populated', intentCount > 0, `${intentCount}/${totalText} posts`));

  const coverage = totalText > 0 ? sentimentCount / totalText : 0;
  checks.push(check('enrichment coverage >= 90%', coverage >= 0.9, `${(coverage * 100).toFixed(1)}%`));

  const tagCount = await count("SELECT COUNT(*) FROM tags");
  checks.push(check('tags exist', tagCount > 0, `${tagCount} tag rows`));

  return { stage: 1, name: 'Enrich', checks, pass: checks.every(c => c.pass) };
}

// ─── Stage 2: Embed ─────────────────────────────────────────

const MODELS = [
  { name: 'nomic-embed-text-v2-moe', column: 'embedding', dim: 768 },
  { name: 'all-minilm', column: 'embedding_minilm', dim: 384 },
  { name: 'bge-m3', column: 'embedding_bge_m3', dim: 1024 },
  { name: 'qwen3-embedding', column: 'embedding_qwen3', dim: 1024 },
  { name: 'snowflake-arctic-embed2', column: 'embedding_arctic2', dim: 1024 },
  { name: 'nomic-embed-text-v2-moe', column: 'embedding_nomic2', dim: 768 },
];

export async function validateEmbed() {
  const checks = [];
  const totalPosts = await count("SELECT COUNT(*) FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 0");
  const totalConvos = await count("SELECT COUNT(*) FROM conversations WHERE reply_text IS NOT NULL AND LENGTH(reply_text) > 0");

  for (const m of MODELS) {
    const postCount = await count(`SELECT COUNT(*) FROM posts WHERE ${m.column} IS NOT NULL`);
    const pct = totalPosts > 0 ? (postCount / totalPosts * 100).toFixed(1) : '0';
    checks.push(check(`posts.${m.column} >= 95%`, postCount / totalPosts >= 0.95, `${pct}% (${postCount}/${totalPosts})`));
  }

  for (const m of MODELS) {
    const convoCount = await count(`SELECT COUNT(*) FROM conversations WHERE ${m.column} IS NOT NULL`);
    const pct = totalConvos > 0 ? (convoCount / totalConvos * 100).toFixed(1) : '0';
    checks.push(check(`convos.${m.column} >= 95%`, convoCount / totalConvos >= 0.95, `${pct}% (${convoCount}/${totalConvos})`));
  }

  return { stage: 2, name: 'Embed', checks, pass: checks.every(c => c.pass) };
}

// ─── Stage 3: Cluster ───────────────────────────────────────

export async function validateCluster() {
  const checks = [];

  // Check tables exist
  const ecExists = await count("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'embedding_clusters'");
  checks.push(check('embedding_clusters table exists', ecExists > 0));

  const pcExists = await count("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'post_clusters'");
  checks.push(check('post_clusters table exists', pcExists > 0));

  if (ecExists === 0 || pcExists === 0) {
    return { stage: 3, name: 'Cluster', checks, pass: false };
  }

  const clusterCount = await count("SELECT COUNT(*) FROM embedding_clusters WHERE model = 'all-minilm'");
  checks.push(check('clusters exist (all-minilm)', clusterCount > 0, `${clusterCount} clusters`));

  const postClusterCount = await count("SELECT COUNT(*) FROM post_clusters WHERE model = 'all-minilm'");
  checks.push(check('post_clusters populated', postClusterCount > 0, `${postClusterCount} assignments`));

  const noiseCount = await count("SELECT COUNT(*) FROM post_clusters WHERE model = 'all-minilm' AND cluster_id = -1");
  const noiseRatio = postClusterCount > 0 ? noiseCount / postClusterCount : 1;
  checks.push(check('noise ratio < 60%', noiseRatio < 0.6, `${(noiseRatio * 100).toFixed(1)}% noise`));

  const namedCount = await count("SELECT COUNT(*) FROM embedding_clusters WHERE model = 'all-minilm' AND name !~ '^Cluster [0-9]+$' AND name IS NOT NULL");
  checks.push(check('clusters have names', namedCount > 0, `${namedCount}/${clusterCount} named`));

  return { stage: 3, name: 'Cluster', checks, pass: checks.every(c => c.pass) };
}

// ─── Stage 4: Palace Sync ───────────────────────────────────

export async function validatePalace() {
  const checks = [];

  const tpExists = await count("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'tp_nodes'");
  if (tpExists === 0) {
    checks.push(check('tp_nodes table exists', false));
    return { stage: 4, name: 'Palace Sync', checks, pass: false };
  }

  const wingCount = await count("SELECT COUNT(*) FROM tp_nodes WHERE node_type = 'wing'");
  checks.push(check('wings exist', wingCount > 0, `${wingCount} wings`));

  const roomCount = await count("SELECT COUNT(*) FROM tp_nodes WHERE node_type = 'room'");
  checks.push(check('rooms exist', roomCount > 0, `${roomCount} rooms`));

  const edgeCount = await count("SELECT COUNT(*) FROM tp_edges");
  checks.push(check('edges exist', edgeCount > 0, `${edgeCount} edges`));

  const drawerCount = await count("SELECT COUNT(*) FROM tp_drawer_refs");
  checks.push(check('drawer refs exist', drawerCount > 0, `${drawerCount} drawer refs`));

  return { stage: 4, name: 'Palace Sync', checks, pass: checks.every(c => c.pass) };
}

// ─── Stage 5: Cluster Naming ────────────────────────────────

export async function validateNaming() {
  const checks = [];

  const total = await count("SELECT COUNT(*) FROM embedding_clusters WHERE model = 'all-minilm'");
  const named = await count("SELECT COUNT(*) FROM embedding_clusters WHERE model = 'all-minilm' AND name IS NOT NULL AND name !~ '^Cluster [0-9]+$'");
  const pct = total > 0 ? (named / total * 100).toFixed(1) : '0';
  checks.push(check('clusters named >= 90%', named / total >= 0.9, `${pct}% (${named}/${total})`));

  const emptyNames = await count("SELECT COUNT(*) FROM embedding_clusters WHERE model = 'all-minilm' AND (name IS NULL OR name = '')");
  checks.push(check('no empty names', emptyNames === 0, emptyNames > 0 ? `${emptyNames} empty` : 'all named'));

  // Check palace labels propagated
  const tpExists = await count("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'tp_nodes'");
  if (tpExists > 0) {
    const wingLabeled = await count("SELECT COUNT(*) FROM tp_nodes WHERE node_type = 'wing' AND label !~ '^Cluster [0-9]+$'");
    const wingTotal = await count("SELECT COUNT(*) FROM tp_nodes WHERE node_type = 'wing'");
    checks.push(check('palace wing labels updated', wingLabeled > 0, `${wingLabeled}/${wingTotal} labeled`));
  }

  return { stage: 5, name: 'Cluster Naming', checks, pass: checks.every(c => c.pass) };
}

// ─── Stage 6: Sentiment LLM ────────────────────────────────

export async function validateSentiment() {
  const checks = [];

  const totalText = await count("SELECT COUNT(*) FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 5");
  const zeroSentiment = await count("SELECT COUNT(*) FROM posts WHERE text IS NOT NULL AND LENGTH(text) > 5 AND sentiment = 0");
  const zeroPct = totalText > 0 ? zeroSentiment / totalText : 1;

  checks.push(check('zero-sentiment < 50%', zeroPct < 0.5, `${(zeroPct * 100).toFixed(1)}% still at 0.0`));

  const nonZero = totalText - zeroSentiment;
  checks.push(check('non-zero sentiment > 1000', nonZero > 1000, `${nonZero} posts with real sentiment`));

  // Check distribution isn't all one value
  const distinctVals = await count("SELECT COUNT(DISTINCT ROUND(sentiment::numeric, 1)) FROM posts WHERE sentiment IS NOT NULL AND sentiment != 0");
  checks.push(check('sentiment diversity >= 5 values', distinctVals >= 5, `${distinctVals} distinct values`));

  return { stage: 6, name: 'Sentiment LLM', checks, pass: checks.every(c => c.pass) };
}

// ─── Run all / standalone ───────────────────────────────────

const VALIDATORS = [
  validateEnrich,
  validateEmbed,
  validateCluster,
  validatePalace,
  validateNaming,
  validateSentiment,
];

export async function runAll(stageFilter) {
  const results = [];
  for (let i = 0; i < VALIDATORS.length; i++) {
    if (stageFilter && (i + 1) !== stageFilter) continue;
    results.push(await VALIDATORS[i]());
  }
  return results;
}

export async function closePool() {
  if (pool) await pool.end();
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith('pipeline-validate.mjs')) {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v || 'true';
    }
  }

  const stageFilter = args.stage ? parseInt(args.stage, 10) : null;
  const results = await runAll(stageFilter);

  console.log('\n  Pipeline Validation Report');
  console.log('  ' + '='.repeat(50));

  let totalPass = 0, totalFail = 0;

  for (const result of results) {
    const icon = result.pass ? 'PASS' : 'FAIL';
    console.log(`\n  [${icon}] Stage ${result.stage}: ${result.name}`);
    for (const c of result.checks) {
      const status = c.pass ? 'PASS' : 'FAIL';
      console.log(`    ${status}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
      if (c.pass) totalPass++; else totalFail++;
    }
  }

  console.log('\n  ' + '='.repeat(50));
  console.log(`  Total: ${totalPass} passed, ${totalFail} failed`);
  console.log();

  await closePool();
  process.exit(totalFail > 0 ? 1 : 0);
}
