#!/usr/bin/env node
/**
 * pipeline.mjs — Full data pipeline orchestrator
 *
 * Chains: Enrich → Embed → Cluster → Palace → Name → Sentiment
 * Validates after each stage. Logs everything.
 *
 * Usage:
 *   node scripts/pipeline.mjs                   # run all stages
 *   node scripts/pipeline.mjs --stage=3         # start from stage 3
 *   node scripts/pipeline.mjs --dry-run         # preview commands
 *   node scripts/pipeline.mjs --skip=2,6        # skip embed + sentiment
 *   node scripts/pipeline.mjs --validate-only   # just run validations
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

// Parse args
const args = {};
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    args[k] = v || 'true';
  }
}

const START_STAGE = parseInt(args.stage || '1', 10);
const DRY_RUN = args['dry-run'] === 'true';
const VALIDATE_ONLY = args['validate-only'] === 'true';
const SKIP = new Set((args.skip || '').split(',').filter(Boolean).map(Number));

// Logging
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
const logPath = path.join(ROOT, 'output', `pipeline-${timestamp}.log`);
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function log(msg = '') {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  logStream.write(line + '\n');
}

// ─── Stage definitions ──────────────────────────────────────

const STAGES = [
  {
    num: 1,
    name: 'Enrich',
    desc: 'Compute tags, sentiment (heuristic), energy, intent',
    commands: [
      { cmd: 'node', args: ['scripts/enrich-posts.mjs'] },
    ],
  },
  {
    num: 2,
    name: 'Embed',
    desc: '9 embedding models on posts + conversations',
    commands: [
      { cmd: 'node', args: ['scripts/embed-multimodel.mjs', '--model=all', '--table=posts', '--batch-size=50', '--concurrency=5'] },
      { cmd: 'node', args: ['scripts/embed-multimodel.mjs', '--model=all', '--table=conversations', '--batch-size=50', '--concurrency=5'] },
    ],
  },
  {
    num: 3,
    name: 'Cluster',
    desc: 'HDBSCAN clustering on embeddings',
    commands: [
      { cmd: 'python3', args: ['scripts/cluster-explorer.py'] },
    ],
  },
  {
    num: 4,
    name: 'Palace Sync',
    desc: 'Convert clusters to palace topology',
    commands: [
      { cmd: 'python3', args: ['scripts/palace/sync_clusters.py', '--rebuild'] },
    ],
  },
  {
    num: 5,
    name: 'Cluster Naming',
    desc: 'Gemma 4 names each cluster',
    commands: [
      { cmd: 'python3', args: ['scripts/palace/rename_clusters.py'] },
    ],
  },
  {
    num: 6,
    name: 'Sentiment LLM',
    desc: 'Gemma 4 re-scores sentiment',
    commands: [
      { cmd: 'node', args: ['scripts/enrich-sentiment-llm.mjs'] },
    ],
  },
  {
    num: 7,
    name: 'Export',
    desc: 'Analyze + export to ByTheWeiCo',
    commands: [
      { cmd: 'node', args: ['scripts/export-to-bytheweico.mjs'] },
    ],
  },
];

// ─── Run a command ──────────────────────────────────────────

function runCommand(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      logStream.write(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write(text);
      logStream.write(text);
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const {
    validateEnrich, validateEmbed, validateCluster,
    validatePalace, validateNaming, validateSentiment, closePool
  } = await import('./pipeline-validate.mjs');

  const validators = {
    1: validateEnrich,
    2: validateEmbed,
    3: validateCluster,
    4: validatePalace,
    5: validateNaming,
    6: validateSentiment,
  };

  log('');
  log('========================================');
  log('  Threads Analysis Pipeline');
  log('========================================');
  log(`  Started: ${new Date().toISOString()}`);
  log(`  Log: ${logPath}`);
  log(`  Start stage: ${START_STAGE}`);
  log(`  Skip stages: ${SKIP.size > 0 ? [...SKIP].join(', ') : 'none'}`);
  log(`  Dry run: ${DRY_RUN}`);
  log(`  Validate only: ${VALIDATE_ONLY}`);
  log('');

  const results = [];
  const pipelineStart = Date.now();

  for (const stage of STAGES) {
    if (stage.num < START_STAGE) continue;
    if (SKIP.has(stage.num)) {
      log(`--- Stage ${stage.num}: ${stage.name} — SKIPPED ---`);
      log('');
      results.push({ num: stage.num, name: stage.name, status: 'skipped' });
      continue;
    }

    log(`--- Stage ${stage.num}: ${stage.name} ---`);
    log(`  ${stage.desc}`);
    const stageStart = Date.now();

    // Run commands (unless dry-run or validate-only)
    if (!DRY_RUN && !VALIDATE_ONLY) {
      for (const { cmd, args: cmdArgs } of stage.commands) {
        const cmdStr = `${cmd} ${cmdArgs.join(' ')}`;
        log(`  > ${cmdStr}`);
        try {
          await runCommand(cmd, cmdArgs);
        } catch (err) {
          log(`  COMMAND FAILED: ${err.message}`);
          log(`  Aborting pipeline.`);
          results.push({ num: stage.num, name: stage.name, status: 'failed', error: err.message });
          printSummary(results, pipelineStart);
          await closePool();
          process.exit(1);
        }
      }
    } else if (DRY_RUN) {
      for (const { cmd, args: cmdArgs } of stage.commands) {
        log(`  [dry-run] would run: ${cmd} ${cmdArgs.join(' ')}`);
      }
    }

    // Validate
    log(`  Validating...`);
    const validator = validators[stage.num];
    if (validator) {
      const result = await validator();
      for (const c of result.checks) {
        const status = c.pass ? 'PASS' : 'FAIL';
        log(`    ${status}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
      }

      const elapsed = ((Date.now() - stageStart) / 1000).toFixed(0);

      if (result.pass) {
        log(`  Stage ${stage.num} PASSED (${elapsed}s)`);
        results.push({ num: stage.num, name: stage.name, status: 'passed', elapsed });
      } else {
        log(`  Stage ${stage.num} VALIDATION FAILED (${elapsed}s)`);
        if (!DRY_RUN && !VALIDATE_ONLY) {
          log(`  Aborting pipeline.`);
          results.push({ num: stage.num, name: stage.name, status: 'failed', elapsed });
          printSummary(results, pipelineStart);
          await closePool();
          process.exit(1);
        } else {
          results.push({ num: stage.num, name: stage.name, status: 'failed', elapsed });
        }
      }
    }

    log('');
  }

  printSummary(results, pipelineStart);
  await closePool();
  const anyFailed = results.some(r => r.status === 'failed');
  process.exit(anyFailed ? 1 : 0);
}

function printSummary(results, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  log('========================================');
  log('  Pipeline Summary');
  log('========================================');
  for (const r of results) {
    const icon = r.status === 'passed' ? 'PASS' : r.status === 'skipped' ? 'SKIP' : 'FAIL';
    log(`  [${icon}] Stage ${r.num}: ${r.name}${r.elapsed ? ` (${r.elapsed}s)` : ''}`);
  }
  log('');
  log(`  Total time: ${elapsed}s`);
  log(`  Passed: ${results.filter(r => r.status === 'passed').length}`);
  log(`  Failed: ${results.filter(r => r.status === 'failed').length}`);
  log(`  Skipped: ${results.filter(r => r.status === 'skipped').length}`);
  log('========================================');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
