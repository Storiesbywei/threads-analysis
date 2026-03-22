#!/usr/bin/env node

/**
 * information-theory.mjs — Shannon analysis of the ByTheWeiCo text corpus
 *
 * Computes: character entropy, word entropy, bigram entropy, Zipf analysis,
 * post-type classification, per-category entropy, surprise scores,
 * mutual information between features, and chaos metrics.
 *
 * Output: docs/information-theory-analysis.md + public/data/post-tags.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log2, entropy, surprise, normalizedEntropy, jointEntropy, mutualInformation, tokenize } from './info-theory-lib.mjs';
import { subClassify } from './sub-classifiers.mjs';
import { loadEnvIntoProcess } from '../lib/threads-api.mjs';
import { query, transaction, upsertTags, close } from '../db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
loadEnvIntoProcess(ROOT);

// ── Load data ────────────────────────────────────────────

const threadsRaw = JSON.parse(readFileSync(join(ROOT, 'data/threads/posts.json'), 'utf-8'));
const posts = threadsRaw.posts
  .filter(p => p.media_type !== 'REPOST_FACADE' && p.text && p.text.trim().length > 0);

console.log(`Loaded ${posts.length} posts with text\n`);

// ── 1. Character-Level Entropy ──────────────────────────

console.log('=== CHARACTER-LEVEL ENTROPY ===');
const allText = posts.map(p => p.text).join(' ').toLowerCase();
const charCounts = {};
for (const ch of allText) {
  charCounts[ch] = (charCounts[ch] || 0) + 1;
}
const charH = entropy(charCounts);
const charHNorm = normalizedEntropy(charCounts);
const uniqueChars = Object.keys(charCounts).length;
console.log(`  Unique characters: ${uniqueChars}`);
console.log(`  Character entropy H(C): ${charH.toFixed(4)} bits`);
console.log(`  Max possible: ${log2(uniqueChars).toFixed(4)} bits`);
console.log(`  Normalized: ${charHNorm.toFixed(4)} (1.0 = uniform)`);
console.log(`  Redundancy: ${((1 - charHNorm) * 100).toFixed(1)}%`);

// English baseline comparison
const englishH = 4.11; // Shannon's estimate for English
console.log(`  English baseline: ~${englishH} bits/char`);
console.log(`  Your text: ${charH.toFixed(2)} bits/char (${charH > englishH ? 'higher' : 'lower'} entropy than typical English)\n`);

// ── 2. Word-Level Entropy & Zipf Analysis ────────────────

console.log('=== WORD-LEVEL ENTROPY & ZIPF ===');
const allWords = [];
const wordCounts = {};
for (const p of posts) {
  const tokens = tokenize(p.text);
  for (const w of tokens) {
    allWords.push(w);
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  }
}

const wordH = entropy(wordCounts);
const vocabSize = Object.keys(wordCounts).length;
const totalWords = allWords.length;
console.log(`  Vocabulary size: ${vocabSize.toLocaleString()} unique words`);
console.log(`  Total words: ${totalWords.toLocaleString()}`);
console.log(`  Type-token ratio: ${(vocabSize / totalWords).toFixed(4)}`);
console.log(`  Word entropy H(W): ${wordH.toFixed(4)} bits`);
console.log(`  Max possible: ${log2(vocabSize).toFixed(4)} bits`);
console.log(`  Normalized: ${(wordH / log2(vocabSize)).toFixed(4)}`);

// Zipf analysis — rank vs frequency
const sortedWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);
console.log(`\n  Top 30 words:`);
sortedWords.slice(0, 30).forEach(([w, c], i) => {
  const rank = i + 1;
  const freq = c / totalWords;
  const zipfExpected = sortedWords[0][1] / rank; // ideal Zipf: f(r) = f(1)/r
  const deviation = ((c - zipfExpected) / zipfExpected * 100).toFixed(0);
  console.log(`    #${String(rank).padStart(2)} ${w.padEnd(12)} freq=${freq.toFixed(4)}  count=${c}  zipf_dev=${deviation}%`);
});

// Zipf exponent estimation (log-log regression on top 1000 words)
const topN = Math.min(1000, sortedWords.length);
let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
for (let i = 0; i < topN; i++) {
  const x = Math.log(i + 1);
  const y = Math.log(sortedWords[i][1]);
  sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
}
const zipfSlope = -(topN * sumXY - sumX * sumY) / (topN * sumX2 - sumX * sumX);
console.log(`\n  Zipf exponent (top ${topN}): α = ${zipfSlope.toFixed(3)} (ideal = 1.0)`);
console.log(`  ${zipfSlope > 1.1 ? 'Steeper than Zipf — concentrated vocabulary' : zipfSlope < 0.9 ? 'Flatter than Zipf — diverse vocabulary' : 'Near-ideal Zipfian distribution'}\n`);

// Hapax legomena (words appearing once)
const hapax = sortedWords.filter(([, c]) => c === 1).length;
const disLeg = sortedWords.filter(([, c]) => c === 2).length;
console.log(`  Hapax legomena (freq=1): ${hapax} (${(hapax / vocabSize * 100).toFixed(1)}% of vocabulary)`);
console.log(`  Dis legomena (freq=2): ${disLeg} (${(disLeg / vocabSize * 100).toFixed(1)}%)`);
console.log(`  Heaps' law coverage: ${(hapax / vocabSize * 100).toFixed(1)}% hapax suggests ${hapax / vocabSize > 0.5 ? 'vocabulary is still growing' : 'vocabulary is saturating'}\n`);

// ── 3. Bigram Entropy (word pairs) ───────────────────────

console.log('=== BIGRAM ENTROPY ===');
const bigramCounts = {};
for (const p of posts) {
  const tokens = tokenize(p.text);
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = tokens[i] + ' ' + tokens[i + 1];
    bigramCounts[bg] = (bigramCounts[bg] || 0) + 1;
  }
}
const bigramH = entropy(bigramCounts);
const uniqueBigrams = Object.keys(bigramCounts).length;
const conditionalH = bigramH - wordH; // H(W2|W1) ≈ H(W1,W2) - H(W1)
console.log(`  Unique bigrams: ${uniqueBigrams.toLocaleString()}`);
console.log(`  Bigram entropy H(W1,W2): ${bigramH.toFixed(4)} bits`);
console.log(`  Conditional entropy H(W2|W1): ${conditionalH.toFixed(4)} bits`);
console.log(`  Predictability gain: ${((1 - conditionalH / wordH) * 100).toFixed(1)}% — knowing the previous word reduces uncertainty by this much`);

const topBigrams = Object.entries(bigramCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log(`\n  Top 20 bigrams:`);
topBigrams.forEach(([bg, c]) => console.log(`    "${bg}" — ${c}`));

// ── 4. Post-Type Classification ──────────────────────────

console.log('\n=== POST-TYPE CLASSIFICATION ===');

// Classification rules (heuristic taxonomy)
// Priority order matters — first match wins for primary_tag.
// Topic-specific regexes first, then speech-act/personal catches, then fallbacks.
const classifiers = [
  { tag: 'reaction',      test: p => p.text.length <= 25 && !/\?/.test(p.text) && !/https?:\/\//.test(p.text) },
  { tag: 'one-liner',     test: p => p.text.length < 50 && p.text.length > 25 && !p.text.includes('\n') },
  { tag: 'question',      test: p => /\?/.test(p.text) },
  { tag: 'political',     test: p => /\b(trump|biden|democrat|republican|politics|government|congress|vote|elect|palestin|israel|gaza|war|genocide|colonialism|imperialism|capitalism|socialist|fascis|protest|policy|legislation|tariff|ice raid|deportat|immigra)\b/i.test(p.text) },
  { tag: 'tech',          test: p => /\b(ai|gpt|llm|openai|anthropic|claude|model|algorithm|code|programming|software|app|api|data|machine learning|neural|tech|crypto|blockchain|bitcoin|nft|iphone|macbook|docker|kubernetes)\b/i.test(p.text) },
  { tag: 'race',          test: p => /\b(race|racial|racism|racist|white|black|asian|poc|bipoc|coloniz|decoloni|ethnic|minority|privilege|supremac|discriminat|african|caucas|undocument)\b/i.test(p.text) },
  { tag: 'philosophy',    test: p => /\b(foucault|deleuze|nietzsche|kant|hegel|marx|ontolog|epistemolog|phenomeno|dialectic|metaphys|existential|ethics|moral|virtue|truth|being|essence|subject|object|discourse|power|knowledge|genealogy|archaeology|heidegger|butler|sontag|freire|baudrillard)\b/i.test(p.text) },
  { tag: 'media',         test: p => /\b(movie|film|show|series|anime|manga|book|read|watch|music|song|album|artist|netflix|hbo|disney|spider.?man|marvel|dc|game|gaming|fortnite|one piece|elden ring|street fighter|guilty gear|walking dead)\b/i.test(p.text) },
  { tag: 'personal',      test: p => /\b(i feel|i think|i('m| am)|my life|my day|honestly|personally|i love|i hate|i miss|i need|i want|i wish|dear world|dear algo)\b/i.test(p.text) },
  { tag: 'finance',       test: p => /\b(money|invest|stock|market|gold|crypto|bitcoin|economy|inflation|price|buy|sell|portfolio|wealth|income|salary|afford|spy|nvda|401k|puts|calls)\b/i.test(p.text) },
  { tag: 'sex-gender',    test: p => /\b(sex|gender|masculin|feminin|queer|lgbtq|trans|gay|lesbian|dating|relationship|tinder|love|attract|hookup|libidinal|desire)\b/i.test(p.text) },
  { tag: 'language',      test: p => /\b(word|language|lingu|semiot|grammar|syntax|etymol|meaning|signif|translat|dialect|slang|english|chinese|arabic|french)\b/i.test(p.text) },
  { tag: 'meta-social',   test: p => /\b(threads|instagram|twitter|social media|algorithm|feed|post|viral|followers|engagement|platform|content creator|influencer|clout)\b/i.test(p.text) },
  { tag: 'food',          test: p => /\b(food|eat|cook|meal|restaurant|coffee|tea|bbq|pizza|rice|chicken|sushi|hungry|lunch|dinner|breakfast)\b/i.test(p.text) },
  { tag: 'work',          test: p => /\b(work|job|career|boss|meeting|project|office|client|hire|fired|interview|manager|jira|deploy|production)\b/i.test(p.text) },
  { tag: 'daily-life',    test: p => /\b(today|yesterday|tonight|morning|bedtime|woke up|just got|heading to|on my way|errands|grocery|laundry|cleaning|streaming|gym)\b/i.test(p.text) },
  { tag: 'commentary',    test: p => /\b(people|everyone|nobody|society|humans|folks|y'all|yall|most people|some people|the problem with|the thing about)\b/i.test(p.text) },
  { tag: 'creative',      test: p => /\b(aesthetic|art|design|poetry|poem|prose|painting|mural|sculpture|sketch|illustration|visual|craft|beautiful)\b/i.test(p.text) },
  { tag: 'url-share',     test: p => /https?:\/\//.test(p.text) },
];

// Load LLM tag overrides (if available) — these override regex for previously-unclassified posts
let llmOverrides = {};
try {
  const overrideData = JSON.parse(readFileSync(join(ROOT, 'data/llm-tag-overrides.json'), 'utf-8'));
  overrideData.forEach(r => { llmOverrides[r.id] = r.tag; });
  console.log(`  Loaded ${Object.keys(llmOverrides).length} LLM tag overrides`);
} catch { /* no overrides file — regex only */ }

// Classify each post (multi-label)
const taggedPosts = posts.map(p => {
  const tags = classifiers
    .filter(c => c.test(p))
    .map(c => c.tag);
  if (tags.length === 0) tags.push('unclassified');

  // Determine primary tag — LLM override wins for previously-unclassified posts
  let primary = tags[0];
  if (llmOverrides[p.id]) {
    primary = llmOverrides[p.id];
    if (!tags.includes(primary)) tags.unshift(primary);
  }

  const sub_tags = subClassify(p.text, primary, tags);

  return {
    id: p.id,
    text: p.text,
    timestamp: p.timestamp,
    is_quote: p.is_quote_post || false,
    is_reply: p.is_reply || false,
    media_type: p.media_type,
    tags,
    sub_tags,
    primary_tag: primary,
    char_count: p.text.length,
    word_count: p.text.split(/\s+/).length,
  };
});

// Tag distribution
const tagCounts = {};
taggedPosts.forEach(p => {
  p.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
});

const primaryCounts = {};
taggedPosts.forEach(p => {
  primaryCounts[p.primary_tag] = (primaryCounts[p.primary_tag] || 0) + 1;
});

console.log('  Multi-label tag distribution (posts can have multiple tags):');
Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
  console.log(`    ${t.padEnd(15)} ${String(c).padStart(5)} (${(c / posts.length * 100).toFixed(1)}%)`);
});

console.log('\n  Primary tag distribution:');
Object.entries(primaryCounts).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
  console.log(`    ${t.padEnd(15)} ${String(c).padStart(5)} (${(c / posts.length * 100).toFixed(1)}%)`);
});

// Tag entropy
const tagH = entropy(primaryCounts);
const tagHNorm = normalizedEntropy(primaryCounts);
console.log(`\n  Tag entropy H(Tag): ${tagH.toFixed(4)} bits`);
console.log(`  Normalized: ${tagHNorm.toFixed(4)}`);
console.log(`  ${tagHNorm > 0.8 ? 'High diversity — posts span many categories evenly' : tagHNorm > 0.6 ? 'Moderate diversity — some categories dominate' : 'Low diversity — concentrated in few categories'}`);

// ── 5. Per-Category Entropy ──────────────────────────────

console.log('\n=== PER-CATEGORY WORD ENTROPY ===');
console.log('  (How predictable is word choice within each category?)\n');

const categoryEntropies = {};
for (const [tag] of Object.entries(tagCounts)) {
  const catPosts = taggedPosts.filter(p => p.tags.includes(tag));
  const catWordCounts = {};
  let catTotalWords = 0;
  for (const p of catPosts) {
    for (const w of tokenize(p.text)) {
      catWordCounts[w] = (catWordCounts[w] || 0) + 1;
      catTotalWords++;
    }
  }
  const catH = entropy(catWordCounts);
  const catVocab = Object.keys(catWordCounts).length;
  categoryEntropies[tag] = {
    entropy: catH,
    vocab: catVocab,
    words: catTotalWords,
    posts: catPosts.length,
    normalized: catVocab > 1 ? catH / log2(catVocab) : 0,
  };
}

Object.entries(categoryEntropies)
  .sort((a, b) => b[1].entropy - a[1].entropy)
  .forEach(([tag, stats]) => {
    console.log(`  ${tag.padEnd(15)} H=${stats.entropy.toFixed(2)} bits  vocab=${String(stats.vocab).padStart(5)}  words=${String(stats.words).padStart(6)}  norm=${stats.normalized.toFixed(3)}  posts=${stats.posts}`);
  });

// ── 6. Post-Level Surprise Scores ────────────────────────

console.log('\n=== POST-LEVEL SURPRISE (SELF-INFORMATION) ===');

// Compute per-post surprise: average surprise of each word given the corpus distribution
const wordProbs = {};
for (const [w, c] of Object.entries(wordCounts)) {
  wordProbs[w] = c / totalWords;
}

const postSurprises = taggedPosts.map(p => {
  const tokens = tokenize(p.text);
  if (tokens.length === 0) return { ...p, surprise: 0, avgSurprise: 0 };
  let totalSurprise = 0;
  for (const w of tokens) {
    const prob = wordProbs[w] || 1 / (totalWords + 1); // Laplace smoothing for unseen
    totalSurprise += surprise(prob);
  }
  return {
    ...p,
    surprise: totalSurprise,
    avgSurprise: totalSurprise / tokens.length,
  };
});

// Most surprising posts (highest average self-information per word)
const byAvgSurprise = [...postSurprises].filter(p => p.word_count >= 5).sort((a, b) => b.avgSurprise - a.avgSurprise);
console.log('  Top 15 most SURPRISING posts (highest avg self-information per word):');
byAvgSurprise.slice(0, 15).forEach((p, i) => {
  console.log(`    ${i + 1}. [${p.avgSurprise.toFixed(2)} bits/word] "${p.text.slice(0, 100)}${p.text.length > 100 ? '...' : ''}"`);
  console.log(`       tags: [${p.tags.join(', ')}]`);
});

// Most predictable posts
const byLowSurprise = [...postSurprises].filter(p => p.word_count >= 5).sort((a, b) => a.avgSurprise - b.avgSurprise);
console.log('\n  Top 15 most PREDICTABLE posts (lowest avg self-information per word):');
byLowSurprise.slice(0, 15).forEach((p, i) => {
  console.log(`    ${i + 1}. [${p.avgSurprise.toFixed(2)} bits/word] "${p.text.slice(0, 100)}${p.text.length > 100 ? '...' : ''}"`);
  console.log(`       tags: [${p.tags.join(', ')}]`);
});

// Surprise distribution stats
const surprises = postSurprises.filter(p => p.word_count >= 3).map(p => p.avgSurprise);
surprises.sort((a, b) => a - b);
console.log(`\n  Surprise distribution (posts ≥ 3 words):`);
console.log(`    Mean: ${(surprises.reduce((a, b) => a + b, 0) / surprises.length).toFixed(3)} bits/word`);
console.log(`    Median: ${surprises[Math.floor(surprises.length / 2)].toFixed(3)} bits/word`);
console.log(`    Std Dev: ${Math.sqrt(surprises.reduce((s, x) => s + Math.pow(x - surprises.reduce((a, b) => a + b, 0) / surprises.length, 2), 0) / surprises.length).toFixed(3)}`);
console.log(`    p10: ${surprises[Math.floor(surprises.length * 0.1)].toFixed(3)}  p90: ${surprises[Math.floor(surprises.length * 0.9)].toFixed(3)}`);

// ── 7. Mutual Information Between Features ───────────────

console.log('\n=== MUTUAL INFORMATION BETWEEN FEATURES ===');

// I(PostType; QuoteStatus) — does being a quote predict the topic?
const quoteCounts = { quote: 0, original: 0 };
const jointTagQuote = {};
taggedPosts.forEach(p => {
  const q = p.is_quote ? 'quote' : 'original';
  quoteCounts[q]++;
  const key = p.primary_tag + '|' + q;
  jointTagQuote[key] = (jointTagQuote[key] || 0) + 1;
});
const miTagQuote = mutualInformation(primaryCounts, quoteCounts, jointTagQuote);
console.log(`  I(PrimaryTag; QuoteStatus) = ${miTagQuote.toFixed(4)} bits`);
console.log(`  ${miTagQuote > 0.1 ? 'Significant: topic choice depends on whether quoting' : miTagQuote > 0.01 ? 'Weak relationship between topic and quote status' : 'Near-independent: topic choice is unrelated to quoting'}`);

// I(PostType; TimeOfDay) — does posting time predict topic?
const hourCounts = {};
const jointTagHour = {};
taggedPosts.forEach(p => {
  const h = String(new Date(p.timestamp).getUTCHours()).padStart(2, '0');
  hourCounts[h] = (hourCounts[h] || 0) + 1;
  const key = p.primary_tag + '|' + h;
  jointTagHour[key] = (jointTagHour[key] || 0) + 1;
});
const miTagHour = mutualInformation(primaryCounts, hourCounts, jointTagHour);
console.log(`  I(PrimaryTag; HourOfDay) = ${miTagHour.toFixed(4)} bits`);
console.log(`  ${miTagHour > 0.1 ? 'Significant: different topics at different times' : miTagHour > 0.01 ? 'Weak temporal topic variation' : 'Near-independent: topics are time-invariant'}`);

// I(PostType; PostLength) — does length predict topic?
const lenBucket = {};
const jointTagLen = {};
taggedPosts.forEach(p => {
  const bucket = p.char_count < 20 ? 'micro' : p.char_count < 50 ? 'short' : p.char_count < 150 ? 'medium' : p.char_count < 500 ? 'long' : 'essay';
  lenBucket[bucket] = (lenBucket[bucket] || 0) + 1;
  const key = p.primary_tag + '|' + bucket;
  jointTagLen[key] = (jointTagLen[key] || 0) + 1;
});
const miTagLen = mutualInformation(primaryCounts, lenBucket, jointTagLen);
console.log(`  I(PrimaryTag; PostLength) = ${miTagLen.toFixed(4)} bits`);
console.log(`  ${miTagLen > 0.1 ? 'Significant: post length correlates with topic' : miTagLen > 0.01 ? 'Weak length-topic correlation' : 'Near-independent: length is unrelated to topic'}`);

// I(PostType; DayOfWeek)
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dowCounts = {};
const jointTagDow = {};
taggedPosts.forEach(p => {
  const d = DOW[new Date(p.timestamp).getUTCDay()];
  dowCounts[d] = (dowCounts[d] || 0) + 1;
  const key = p.primary_tag + '|' + d;
  jointTagDow[key] = (jointTagDow[key] || 0) + 1;
});
const miTagDow = mutualInformation(primaryCounts, dowCounts, jointTagDow);
console.log(`  I(PrimaryTag; DayOfWeek) = ${miTagDow.toFixed(4)} bits`);

// ── 8. Chaos & Complexity Metrics ────────────────────────

console.log('\n=== CHAOS & COMPLEXITY METRICS ===');

// Vocabulary growth rate (Heaps' law: V(n) = K * n^β)
// Sample at intervals to estimate β
const heapsSamples = [];
const seenWords = new Set();
let wordIdx = 0;
const checkpoints = [100, 500, 1000, 5000, 10000, 50000, 100000, totalWords];
for (const p of posts) {
  for (const w of tokenize(p.text)) {
    seenWords.add(w);
    wordIdx++;
    if (checkpoints.includes(wordIdx)) {
      heapsSamples.push({ n: wordIdx, v: seenWords.size });
    }
  }
}

console.log('  Vocabulary growth (Heaps\' law):');
heapsSamples.forEach(s => {
  console.log(`    n=${String(s.n).padStart(7)} → V=${String(s.v).padStart(5)} (ratio=${(s.v / s.n).toFixed(4)})`);
});

// Estimate β from first and last sample
if (heapsSamples.length >= 2) {
  const first = heapsSamples[0];
  const last = heapsSamples[heapsSamples.length - 1];
  const beta = Math.log(last.v / first.v) / Math.log(last.n / first.n);
  console.log(`  Heaps' exponent β ≈ ${beta.toFixed(3)} (β=1 means new word every word; β≈0.5 is typical for English)`);
  console.log(`  ${beta > 0.6 ? 'High vocabulary novelty — you keep introducing new words' : beta > 0.4 ? 'Typical vocabulary growth' : 'Vocabulary is saturating'}`);
}

// Topic switching entropy — how much does your primary tag change post-to-post?
const sortedByTime = [...taggedPosts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
const transitionCounts = {};
for (let i = 1; i < sortedByTime.length; i++) {
  const from = sortedByTime[i - 1].primary_tag;
  const to = sortedByTime[i].primary_tag;
  const key = from + '→' + to;
  transitionCounts[key] = (transitionCounts[key] || 0) + 1;
}
const transitionH = entropy(transitionCounts);
const stayRate = Object.entries(transitionCounts)
  .filter(([k]) => k.split('→')[0] === k.split('→')[1])
  .reduce((s, [, c]) => s + c, 0) / (sortedByTime.length - 1);

console.log(`\n  Topic transition entropy: ${transitionH.toFixed(4)} bits`);
console.log(`  Topic stay rate: ${(stayRate * 100).toFixed(1)}% (same topic as previous post)`);
console.log(`  Topic switch rate: ${((1 - stayRate) * 100).toFixed(1)}%`);
console.log(`  ${stayRate < 0.3 ? 'CHAOTIC — you rarely stay on topic between consecutive posts' : stayRate < 0.5 ? 'Moderately chaotic — frequent topic switches' : 'Relatively focused — tendency to stay on topic'}`);

// Top transitions
console.log('\n  Top 15 topic transitions:');
Object.entries(transitionCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, c]) => {
  console.log(`    ${k.padEnd(30)} ${c} (${(c / (sortedByTime.length - 1) * 100).toFixed(1)}%)`);
});

// Posting burst analysis — inter-post intervals
const intervals = [];
for (let i = 1; i < sortedByTime.length; i++) {
  const dt = (new Date(sortedByTime[i].timestamp) - new Date(sortedByTime[i - 1].timestamp)) / 60000; // minutes
  if (dt >= 0 && dt < 60 * 24 * 7) intervals.push(dt); // cap at 1 week
}
intervals.sort((a, b) => a - b);
const burstThreshold = 5; // minutes
const bursts = intervals.filter(i => i < burstThreshold).length;
console.log(`\n  Inter-post interval analysis:`);
console.log(`    Mean: ${(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1)} minutes`);
console.log(`    Median: ${intervals[Math.floor(intervals.length / 2)].toFixed(1)} minutes`);
console.log(`    Posts within ${burstThreshold}min of previous: ${bursts} (${(bursts / intervals.length * 100).toFixed(1)}%) — burst posting`);
console.log(`    Posts >1h after previous: ${intervals.filter(i => i > 60).length} (${(intervals.filter(i => i > 60).length / intervals.length * 100).toFixed(1)}%)`);
console.log(`    Posts >24h after previous: ${intervals.filter(i => i > 1440).length} (${(intervals.filter(i => i > 1440).length / intervals.length * 100).toFixed(1)}%)`);

// ── 9. Output tagged posts ───────────────────────────────

// Sub-tag distribution
const subTagCounts = {};
taggedPosts.forEach(p => {
  for (const st of p.sub_tags) {
    subTagCounts[st] = (subTagCounts[st] || 0) + 1;
  }
});

const output = {
  generated_at: new Date().toISOString(),
  corpus_stats: {
    total_posts: posts.length,
    total_words: totalWords,
    vocabulary_size: vocabSize,
    character_entropy: Math.round(charH * 1000) / 1000,
    word_entropy: Math.round(wordH * 1000) / 1000,
    bigram_entropy: Math.round(bigramH * 1000) / 1000,
    conditional_entropy: Math.round(conditionalH * 1000) / 1000,
    zipf_exponent: Math.round(zipfSlope * 1000) / 1000,
    tag_entropy: Math.round(tagH * 1000) / 1000,
  },
  tag_distribution: Object.fromEntries(
    Object.entries(primaryCounts).sort((a, b) => b[1] - a[1])
  ),
  sub_tag_distribution: Object.fromEntries(
    Object.entries(subTagCounts).sort((a, b) => b[1] - a[1])
  ),
  category_entropies: Object.fromEntries(
    Object.entries(categoryEntropies).map(([k, v]) => [k, {
      entropy: Math.round(v.entropy * 100) / 100,
      vocabulary: v.vocab,
      posts: v.posts,
      normalized: Math.round(v.normalized * 1000) / 1000,
    }])
  ),
  posts: postSurprises.map(p => ({
    id: p.id,
    tags: p.tags,
    sub_tags: p.sub_tags,
    primary_tag: p.primary_tag,
    surprise: Math.round(p.avgSurprise * 100) / 100,
    word_count: p.word_count,
    is_quote: p.is_quote,
    is_reply: p.is_reply || false,
  })),
};

writeFileSync(join(ROOT, 'public/data/post-tags.json'), JSON.stringify(output, null, 2));
console.log(`\nWrote post-tags.json (${output.posts.length} tagged posts)`);

// ── 10. Persist to Postgres ───────────────────────────────

console.log('\n=== PERSISTING TO POSTGRES ===');
const pgStart = Date.now();

try {
  // Upsert tags + sub_tags + surprise_scores in batches of 1000
  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(postSurprises.length / BATCH_SIZE);
  let tagsWritten = 0;
  let surpriseWritten = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batch = postSurprises.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    await transaction(async (client) => {
      for (const p of batch) {
        // Upsert tags and sub_tags
        await upsertTags(p.id, {
          tags: p.tags,
          primaryTag: p.primary_tag,
          subTags: p.sub_tags,
        }, client);
        tagsWritten++;

        // Insert/update surprise score
        await client.query(
          `INSERT INTO surprise_scores (post_id, surprise, avg_surprise, computed_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (post_id) DO UPDATE SET
             surprise = EXCLUDED.surprise,
             avg_surprise = EXCLUDED.avg_surprise,
             computed_at = NOW()`,
          [p.id, p.surprise, p.avgSurprise]
        );
        surpriseWritten++;
      }
    });
    const elapsed = ((Date.now() - pgStart) / 1000).toFixed(1);
    console.log(`  Batch ${b + 1}/${totalBatches} — ${tagsWritten} tags, ${surpriseWritten} surprise scores (${elapsed}s)`);
  }

  // Heaps' exponent (recompute for snapshot)
  let heapsBeta = null;
  if (heapsSamples.length >= 2) {
    const first = heapsSamples[0];
    const last = heapsSamples[heapsSamples.length - 1];
    heapsBeta = Math.log(last.v / first.v) / Math.log(last.n / first.n);
  }

  // Burst rate
  const burstRate = intervals.length > 0
    ? intervals.filter(i => i < burstThreshold).length / intervals.length
    : null;

  // Insert corpus snapshot
  await query(
    `INSERT INTO corpus_snapshots (
       total_posts, total_words, vocabulary_size,
       char_entropy, word_entropy, bigram_entropy, conditional_entropy,
       zipf_exponent, tag_entropy, heaps_exponent,
       topic_stay_rate, burst_rate,
       tag_distribution, sub_tag_distribution, category_entropies
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      posts.length,
      totalWords,
      vocabSize,
      charH,
      wordH,
      bigramH,
      conditionalH,
      zipfSlope,
      tagH,
      heapsBeta,
      stayRate,
      burstRate,
      JSON.stringify(output.tag_distribution),
      JSON.stringify(output.sub_tag_distribution),
      JSON.stringify(output.category_entropies),
    ]
  );

  const pgElapsed = ((Date.now() - pgStart) / 1000).toFixed(1);
  console.log(`  Postgres: ${tagsWritten} tags, ${surpriseWritten} surprise scores, 1 corpus snapshot in ${pgElapsed}s`);
} catch (err) {
  console.error('  Postgres write failed:', err.message);
  console.error('  (JSON output was still written successfully)');
}

await close();
console.log('\n=== ANALYSIS COMPLETE ===');
