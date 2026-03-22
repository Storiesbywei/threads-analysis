#!/usr/bin/env node

/**
 * knowledge-graph.mjs — Topic knowledge graph generator
 *
 * Reads post-tags.json + raw posts.json (for timestamps).
 * Outputs public/data/knowledge-graph.json.
 *
 * Four computation layers:
 * 1. Co-occurrence edges — PMI-weighted tag×tag pairs from multi-label posts
 * 2. Temporal proximity edges — 5-post sliding window MI for tag sequences
 * 3. Concept nodes — TF-IDF key terms per tag (top 10 per category)
 * 4. Bridge concepts — words spanning 3+ unrelated categories
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pmi, npmi, tokenize, log2 } from './info-theory-lib.mjs';
import { loadEnvIntoProcess } from '../lib/threads-api.mjs';
import { query, transaction, close } from '../db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
loadEnvIntoProcess(ROOT);

// ── Load data ────────────────────────────────────────────

const postTagsData = JSON.parse(readFileSync(join(ROOT, 'public/data/post-tags.json'), 'utf-8'));
const posts = postTagsData.posts;
const totalPosts = posts.length;

// Raw posts for text (post-tags.json posts don't have text in output)
const rawPosts = JSON.parse(readFileSync(join(ROOT, 'data/threads/posts.json'), 'utf-8'));
const rawPostMap = new Map();
for (const p of (rawPosts.posts || rawPosts)) {
  if (p.text && p.text.trim().length > 0) rawPostMap.set(p.id, p);
}

console.log(`Knowledge graph: ${totalPosts} posts, ${rawPostMap.size} with text\n`);

// ── Tag colors ───────────────────────────────────────────

const TAG_COLORS = {
  'reaction': '#8b6914', 'one-liner': '#6b5010', 'tech': '#2d6b5a', 'media': '#5a3a7a',
  'question': '#3d5a8b', 'personal': '#7a4a2a', 'philosophy': '#6b3a8b', 'daily-life': '#4a6741',
  'political': '#7a1e1e', 'finance': '#2a5a8b', 'shitpost': '#8b3a1e', 'food': '#6b8b4a',
  'race': '#8b2a2a', 'meta-social': '#6b5a3e', 'sex-gender': '#8b3a7a', 'language': '#3a6b5a',
  'commentary': '#5a5a3a', 'work': '#3a5a6b', 'creative': '#7a3a6b', 'url-share': '#5a6b3a',
};

const SUB_TAG_COLORS = {
  'race:cultural_reference': '#a84040', 'race:structural_critique': '#c44040',
  'race:intersectional': '#8b4040', 'race:personal_experience': '#704040',
  'sex-gender:queer_identity': '#a84090', 'sex-gender:gender_discourse': '#8b3a7a',
  'sex-gender:romantic_dynamics': '#c44090', 'sex-gender:sexuality': '#704070',
  'sex-gender:personal_reflection': '#904070',
  'philosophy:continental': '#7040a0', 'philosophy:ethics_morality': '#6b3a8b',
  'philosophy:epistemology': '#9040c0', 'philosophy:social_political': '#504080',
  'tech:ai_ml': '#2d8b6b', 'tech:programming': '#2d6b5a',
  'tech:crypto_web3': '#4d8b6b', 'tech:consumer': '#1d5b4a',
  'political:domestic': '#9a2020', 'political:international': '#7a1e1e',
  'political:protest_activism': '#b03030',
};

// ── 1. Co-occurrence edges (PMI-weighted) ────────────────

console.log('=== CO-OCCURRENCE EDGES ===');

const tagPostCount = {};       // tag → count of posts with this tag
const pairPostCount = {};      // "tagA|tagB" → count of posts with both

for (const p of posts) {
  const allTags = [...new Set([...p.tags, ...p.sub_tags])];
  for (const t of allTags) {
    tagPostCount[t] = (tagPostCount[t] || 0) + 1;
  }
  // Pairs (sorted to avoid duplicates)
  for (let i = 0; i < allTags.length; i++) {
    for (let j = i + 1; j < allTags.length; j++) {
      const pair = [allTags[i], allTags[j]].sort().join('|');
      pairPostCount[pair] = (pairPostCount[pair] || 0) + 1;
    }
  }
}

const coOccurrenceEdges = [];
for (const [pair, count] of Object.entries(pairPostCount)) {
  if (count < 5) continue; // minimum co-occurrence threshold
  const [a, b] = pair.split('|');
  const pA = tagPostCount[a] / totalPosts;
  const pB = tagPostCount[b] / totalPosts;
  const pAB = count / totalPosts;
  const pmiVal = pmi(pA, pB, pAB);
  const npmiVal = npmi(pA, pB, pAB);

  if (npmiVal > 0) { // only positive associations
    coOccurrenceEdges.push({
      source: a,
      target: b,
      type: 'co_occurrence',
      weight: Math.round(npmiVal * 1000) / 1000,
      count,
    });
  }
}

coOccurrenceEdges.sort((a, b) => b.weight - a.weight);
console.log(`  ${coOccurrenceEdges.length} co-occurrence edges (NPMI > 0, count ≥ 5)`);
console.log(`  Top 5: ${coOccurrenceEdges.slice(0, 5).map(e => `${e.source}↔${e.target} (${e.weight})`).join(', ')}`);

// ── 2. Temporal proximity edges ──────────────────────────

console.log('\n=== TEMPORAL PROXIMITY EDGES ===');

// Sort posts by timestamp, then use 5-post sliding window
const sortedPosts = [...posts].sort((a, b) => {
  const rawA = rawPostMap.get(a.id);
  const rawB = rawPostMap.get(b.id);
  const tsA = rawA ? new Date(rawA.timestamp).getTime() : 0;
  const tsB = rawB ? new Date(rawB.timestamp).getTime() : 0;
  return tsA - tsB;
});

const windowSize = 5;
const temporalPairCount = {};
const temporalTagCount = {};
let windowCount = 0;

for (let i = 0; i <= sortedPosts.length - windowSize; i++) {
  const windowTags = new Set();
  for (let j = i; j < i + windowSize; j++) {
    windowTags.add(sortedPosts[j].primary_tag);
  }
  windowCount++;

  const tagsArr = [...windowTags];
  for (const t of tagsArr) {
    temporalTagCount[t] = (temporalTagCount[t] || 0) + 1;
  }
  for (let a = 0; a < tagsArr.length; a++) {
    for (let b = a + 1; b < tagsArr.length; b++) {
      const pair = [tagsArr[a], tagsArr[b]].sort().join('|');
      temporalPairCount[pair] = (temporalPairCount[pair] || 0) + 1;
    }
  }
}

const temporalEdges = [];
for (const [pair, count] of Object.entries(temporalPairCount)) {
  if (count < 10) continue;
  const [a, b] = pair.split('|');
  const pA = temporalTagCount[a] / windowCount;
  const pB = temporalTagCount[b] / windowCount;
  const pAB = count / windowCount;
  const npmiVal = npmi(pA, pB, pAB);

  if (npmiVal > 0.05) {
    temporalEdges.push({
      source: a,
      target: b,
      type: 'temporal',
      weight: Math.round(npmiVal * 1000) / 1000,
      count,
    });
  }
}

temporalEdges.sort((a, b) => b.weight - a.weight);
console.log(`  ${temporalEdges.length} temporal proximity edges (NPMI > 0.05, count ≥ 10)`);

// ── 3. Concept nodes (TF-IDF key terms per tag) ──────────

console.log('\n=== CONCEPT NODES (TF-IDF) ===');

const STOP_WORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can','could','must','and','but','or','nor','not','so','yet','for','to','of','in','on','at','by','with','from','up','about','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','both','each','few','more','most','other','some','such','no','only','own','same','than','too','very','just','because','as','until','while','if','that','it','its','this','these','those','which','what','who','whom','i','me','my','myself','we','our','ours','us','you','your','yours','he','him','his','she','her','they','them','their','am','also','get','got','like','really','dont','im','ive','thats','youre','thing','things','even','still','much','well','going','one','two','don','doesn','didn','isn','aren','wasn','weren','won','wouldn','couldn','shouldn','hasn','haven','hadn','ve','ll','re','let','know','want','need','say','said','make','made','come','came','take','took','see','saw','tell','told','give','gave','look','use','way','day','people','time','new','now','right','back','something','every','anything','everything','someone','anyone','everyone','keep','put','try','thought','actually','literally','kinda','gonna','wanna','gotta','https','http','www','com','org','net']);

// Build per-tag word counts + document frequency
const tagWordCounts = {};   // tag → { word: count }
const docFrequency = {};    // word → number of tags it appears in
const primaryTags = [...new Set(posts.map(p => p.primary_tag))];

for (const tag of primaryTags) {
  const catPosts = posts.filter(p => p.primary_tag === tag);
  const wordCounts = {};
  for (const p of catPosts) {
    const raw = rawPostMap.get(p.id);
    if (!raw) continue;
    for (const w of tokenize(raw.text)) {
      if (STOP_WORDS.has(w) || w.length < 3) continue;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }
  tagWordCounts[tag] = wordCounts;
}

// Document frequency: how many tags contain each word
for (const wc of Object.values(tagWordCounts)) {
  for (const w of Object.keys(wc)) {
    docFrequency[w] = (docFrequency[w] || 0) + 1;
  }
}

const numDocs = primaryTags.length;
const conceptNodes = [];
const conceptEdges = [];

for (const tag of primaryTags) {
  const wc = tagWordCounts[tag];
  if (!wc) continue;
  const totalWordsInTag = Object.values(wc).reduce((a, b) => a + b, 0);

  // TF-IDF scoring
  const scored = Object.entries(wc).map(([word, count]) => {
    const tf = count / totalWordsInTag;
    const idf = log2(numDocs / (docFrequency[word] || 1));
    return { word, tfidf: tf * idf, count };
  });

  scored.sort((a, b) => b.tfidf - a.tfidf);
  const top10 = scored.slice(0, 10);

  for (const { word, tfidf, count } of top10) {
    const nodeId = `concept:${word}`;
    // Avoid duplicate concept nodes
    if (!conceptNodes.find(n => n.id === nodeId)) {
      conceptNodes.push({
        id: nodeId,
        label: word,
        type: 'concept',
        post_count: count,
        size: Math.round(tfidf * 10000) / 10000,
        color: '#666666',
      });
    }
    conceptEdges.push({
      source: tag,
      target: nodeId,
      type: 'concept_link',
      weight: Math.round(tfidf * 10000) / 10000,
      count,
    });
  }
}

console.log(`  ${conceptNodes.length} unique concept nodes`);
console.log(`  ${conceptEdges.length} concept → tag edges`);

// ── 4. Bridge concepts ───────────────────────────────────

console.log('\n=== BRIDGE CONCEPTS ===');

// Words that appear in 3+ unrelated categories with significant count
const bridgeNodes = [];
const bridgeEdges = [];

for (const [word, df] of Object.entries(docFrequency)) {
  if (df < 3) continue;
  if (STOP_WORDS.has(word) || word.length < 4) continue;

  // Check total occurrences across all tags
  let totalCount = 0;
  const presentIn = [];
  for (const tag of primaryTags) {
    const count = tagWordCounts[tag]?.[word] || 0;
    if (count >= 3) { // minimum 3 occurrences per category
      totalCount += count;
      presentIn.push(tag);
    }
  }

  if (presentIn.length >= 3 && totalCount >= 15) {
    const nodeId = `bridge:${word}`;
    // Skip if already a concept node
    if (conceptNodes.find(n => n.label === word)) continue;

    bridgeNodes.push({
      id: nodeId,
      label: word,
      type: 'bridge',
      post_count: totalCount,
      size: presentIn.length,
      color: '#d4a017',
    });

    for (const tag of presentIn) {
      bridgeEdges.push({
        source: tag,
        target: nodeId,
        type: 'bridge_link',
        weight: tagWordCounts[tag][word] / totalCount,
        count: tagWordCounts[tag][word],
      });
    }
  }
}

bridgeNodes.sort((a, b) => b.size - a.size);
console.log(`  ${bridgeNodes.length} bridge concepts (span 3+ categories)`);
if (bridgeNodes.length > 0) {
  console.log(`  Top 5: ${bridgeNodes.slice(0, 5).map(n => `"${n.label}" (${n.size} cats)`).join(', ')}`);
}

// ── 5. Build hierarchy edges ─────────────────────────────

const hierarchyEdges = [];
const subTagDist = postTagsData.sub_tag_distribution || {};
for (const subTag of Object.keys(subTagDist)) {
  const parent = subTag.split(':')[0];
  if (TAG_COLORS[parent]) {
    hierarchyEdges.push({
      source: parent,
      target: subTag,
      type: 'hierarchy',
      weight: 1,
      count: subTagDist[subTag],
    });
  }
}

console.log(`\n  ${hierarchyEdges.length} hierarchy edges (parent → sub-tag)`);

// ── 6. Assemble output ──────────────────────────────────

const nodes = [];

// Tag nodes
for (const [tag, count] of Object.entries(postTagsData.tag_distribution)) {
  nodes.push({
    id: tag,
    label: tag,
    type: 'tag',
    post_count: count,
    size: count,
    color: TAG_COLORS[tag] || '#888888',
  });
}

// Sub-tag nodes
for (const [subTag, count] of Object.entries(subTagDist)) {
  nodes.push({
    id: subTag,
    label: subTag.split(':')[1].replace(/_/g, ' '),
    type: 'sub_tag',
    post_count: count,
    size: count,
    color: SUB_TAG_COLORS[subTag] || '#aaaaaa',
  });
}

// Add concept + bridge nodes
nodes.push(...conceptNodes, ...bridgeNodes);

// Deduplicate edges
const allEdges = [...coOccurrenceEdges, ...temporalEdges, ...hierarchyEdges, ...conceptEdges, ...bridgeEdges];

// Verify all edge references are valid
const nodeIds = new Set(nodes.map(n => n.id));
const validEdges = allEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

const output = {
  generated_at: new Date().toISOString(),
  metadata: {
    total_posts: totalPosts,
    tag_count: Object.keys(postTagsData.tag_distribution).length,
    sub_tag_count: Object.keys(subTagDist).length,
    node_count: nodes.length,
    edge_count: validEdges.length,
  },
  nodes,
  edges: validEdges,
};

writeFileSync(join(ROOT, 'public/data/knowledge-graph.json'), JSON.stringify(output, null, 2));
console.log(`\nWrote knowledge-graph.json: ${nodes.length} nodes, ${validEdges.length} edges`);

// ── 7. Persist to Postgres ────────────────────────────────

console.log('\n=== PERSISTING TO POSTGRES ===');
const pgStart = Date.now();

try {
  // Clear old graph data (edges first due to FK constraint)
  await query('DELETE FROM kg_edges');
  await query('DELETE FROM kg_nodes');
  console.log('  Cleared old kg_nodes/kg_edges');

  // Insert nodes in transaction batches
  const NODE_BATCH_SIZE = 500;
  const nodeBatches = Math.ceil(nodes.length / NODE_BATCH_SIZE);
  for (let b = 0; b < nodeBatches; b++) {
    const batch = nodes.slice(b * NODE_BATCH_SIZE, (b + 1) * NODE_BATCH_SIZE);
    await transaction(async (client) => {
      for (const node of batch) {
        await client.query(
          `INSERT INTO kg_nodes (id, label, node_type, post_count, size, color)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, node_type=EXCLUDED.node_type,
             post_count=EXCLUDED.post_count, size=EXCLUDED.size, color=EXCLUDED.color`,
          [node.id, node.label, node.type, node.post_count, node.size, node.color]
        );
      }
    });
    console.log(`  Nodes batch ${b + 1}/${nodeBatches} — ${Math.min((b + 1) * NODE_BATCH_SIZE, nodes.length)}/${nodes.length}`);
  }

  // Insert edges in transaction batches
  const EDGE_BATCH_SIZE = 1000;
  const edgeBatches = Math.ceil(validEdges.length / EDGE_BATCH_SIZE);
  for (let b = 0; b < edgeBatches; b++) {
    const batch = validEdges.slice(b * EDGE_BATCH_SIZE, (b + 1) * EDGE_BATCH_SIZE);
    await transaction(async (client) => {
      for (const edge of batch) {
        await client.query(
          `INSERT INTO kg_edges (source, target, edge_type, weight, count)
           VALUES ($1, $2, $3, $4, $5)`,
          [edge.source, edge.target, edge.type, edge.weight, edge.count]
        );
      }
    });
    console.log(`  Edges batch ${b + 1}/${edgeBatches} — ${Math.min((b + 1) * EDGE_BATCH_SIZE, validEdges.length)}/${validEdges.length}`);
  }

  const pgElapsed = ((Date.now() - pgStart) / 1000).toFixed(1);
  console.log(`  Postgres: ${nodes.length} nodes, ${validEdges.length} edges in ${pgElapsed}s`);
} catch (err) {
  console.error('  Postgres write failed:', err.message);
  console.error('  (JSON output was still written successfully)');
}

await close();
console.log('=== KNOWLEDGE GRAPH COMPLETE ===');
