#!/usr/bin/env node
/**
 * export-to-bytheweico.mjs — Analyze + export datasets to ByTheWeiCo
 *
 * 1. Runs `npm run analyze` (information-theory + knowledge-graph)
 * 2. Exports clusters, UMAP scatter, palace topology from Postgres
 * 3. Copies all 5 files to ByTheWeiCo/public/data/
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://threads:threads_local_dev@localhost:5433/threads';
const TARGET_DIR = process.env.BYTHEWEICO_DATA_DIR || '/Users/weixiangzhang/Local_Dev/projects/ByTheWeiCo/public/data';

function log(msg) {
  console.log(`[export] ${msg}`);
}

async function main() {
  const startTime = Date.now();

  // ── Step 1: Run analyze ──────────────────────────────────────
  log('Running npm run analyze...');
  try {
    execSync('npm run analyze', { cwd: ROOT, stdio: 'inherit' });
    log('Analyze complete.');
  } catch (err) {
    log(`Analyze failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2: Copy post-tags.json and knowledge-graph.json ─────
  const analyzeFiles = ['post-tags.json', 'knowledge-graph.json'];
  for (const file of analyzeFiles) {
    const src = path.join(ROOT, 'public', 'data', file);
    const dest = path.join(TARGET_DIR, file);
    if (!fs.existsSync(src)) {
      log(`Missing ${src} — skipping.`);
      continue;
    }
    fs.copyFileSync(src, dest);
    log(`Copied ${file} -> ${dest}`);
  }

  // ── Step 3: Export from Postgres ─────────────────────────────
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const generatedAt = new Date().toISOString();

  try {
    // Clusters
    log('Exporting clusters.json...');
    const clustersResult = await pool.query(`
      SELECT cluster_id, name, description, size,
             avg_sentiment::numeric(4,3), dominant_energy, dominant_intent,
             date_start, date_end,
             centroid_x::numeric(6,3), centroid_y::numeric(6,3)
      FROM embedding_clusters ORDER BY size DESC
    `);
    const clustersPath = path.join(TARGET_DIR, 'clusters.json');
    fs.writeFileSync(clustersPath, JSON.stringify({ generated_at: generatedAt, clusters: clustersResult.rows }, null, 2));
    log(`Wrote clusters.json (${clustersResult.rows.length} clusters)`);

    // UMAP scatter
    log('Exporting umap-scatter.json...');
    const umapResult = await pool.query(`
      SELECT post_id as id, round(umap_x::numeric, 3) as x, round(umap_y::numeric, 3) as y,
             cluster_id as c, probability::numeric(3,2) as p
      FROM post_clusters
    `);
    const umapPath = path.join(TARGET_DIR, 'umap-scatter.json');
    fs.writeFileSync(umapPath, JSON.stringify({ generated_at: generatedAt, points: umapResult.rows }, null, 2));
    log(`Wrote umap-scatter.json (${umapResult.rows.length} points)`);

    // Palace topology
    log('Exporting palace-topology.json...');
    const wingsResult = await pool.query(`
      SELECT node_id as id, label, metadata as meta FROM tp_nodes WHERE node_type = 'wing'
    `);
    const edgesResult = await pool.query(`
      SELECT source_id as s, target_id as t, relationship as r, round(weight::numeric, 3) as w
      FROM tp_edges
      WHERE source_id IN (SELECT node_id FROM tp_nodes WHERE node_type='wing')
        AND target_id IN (SELECT node_id FROM tp_nodes WHERE node_type='wing')
    `);
    const palacePath = path.join(TARGET_DIR, 'palace-topology.json');
    fs.writeFileSync(palacePath, JSON.stringify({
      generated_at: generatedAt,
      wings: wingsResult.rows,
      edges: edgesResult.rows,
    }, null, 2));
    log(`Wrote palace-topology.json (${wingsResult.rows.length} wings, ${edgesResult.rows.length} edges)`);

  } catch (err) {
    log(`Postgres export failed: ${err.message}`);
    await pool.end();
    process.exit(1);
  }

  await pool.end();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Export complete in ${elapsed}s. 5 files written to ${TARGET_DIR}`);
  process.exit(0);
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
