#!/usr/bin/env node
/**
 * keyword-search.mjs — Search Threads for keywords and score sentiment
 *
 * Usage: node scripts/keyword-search.mjs "foucault" "AI stocks" "$NVDA"
 *
 * For each keyword:
 *   1. Calls Threads keyword_search API
 *   2. Scores each post with keyword sentiment heuristics
 *   3. Aggregates results (sentiment score, positive/negative/neutral counts)
 *   4. Saves top 5 posts by engagement as JSONB
 *   5. Inserts into keyword_searches table
 *   6. Prints results
 *
 * Rate limit: 500 searches per 7-day rolling window — be conservative.
 */

import { fetchJSON, sleep, loadEnvIntoProcess, BASE } from './lib/threads-api.mjs';
import { query, close } from './db.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Sentiment word lists ────────────────────────────────────

const POSITIVE_WORDS = new Set([
  'love', 'great', 'amazing', 'beautiful', 'fire', 'based', 'goat',
  'w', 'incredible', 'brilliant', 'awesome', 'excellent', 'fantastic',
  'wonderful', 'best', 'perfect', 'good', 'nice', 'solid', 'strong',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'wrong', 'hate', 'cringe', 'mid', 'l', 'ratio',
  'trash', 'awful', 'worst', 'horrible', 'disgusting', 'pathetic',
  'garbage', 'weak', 'boring', 'stupid', 'dumb', 'broken',
]);

const BULLISH_WORDS = new Set([
  'bullish', 'buy', 'moon', 'calls', 'long', 'accumulate', 'dip',
  'upside', 'growth', 'beat', 'squeeze', 'undervalued', 'breakout',
  'bull', 'pump', 'rally', 'rocket', 'soar', 'green',
]);

const BEARISH_WORDS = new Set([
  'bearish', 'sell', 'crash', 'puts', 'short', 'dump', 'bubble',
  'downside', 'miss', 'fraud', 'scam', 'baghold', 'overvalued',
  'bear', 'tank', 'drop', 'plunge', 'red', 'collapse',
]);

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Detect if a query is financial (starts with $ or contains stock-related terms).
 */
function isFinancialQuery(keyword) {
  if (keyword.startsWith('$')) return true;
  const lower = keyword.toLowerCase();
  const financialTerms = ['stock', 'stocks', 'share', 'shares', 'ticker', 'market',
    'invest', 'trading', 'etf', 'portfolio', 'dividend', 'earnings'];
  return financialTerms.some(t => lower.includes(t));
}

/**
 * Score a single post's sentiment.
 * Returns a score from -1 (negative/bearish) to +1 (positive/bullish).
 */
function scorePost(text, financial = false) {
  if (!text) return { score: 0, positive: 0, negative: 0, bullish: 0, bearish: 0, label: 'neutral' };

  const words = text.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9$]/g, ''));
  const wordSet = new Set(words);

  let positive = 0;
  let negative = 0;
  let bullish = 0;
  let bearish = 0;

  for (const w of wordSet) {
    if (POSITIVE_WORDS.has(w)) positive++;
    if (NEGATIVE_WORDS.has(w)) negative++;
    if (financial) {
      if (BULLISH_WORDS.has(w)) bullish++;
      if (BEARISH_WORDS.has(w)) bearish++;
    }
  }

  // Combine: for financial queries, weight financial sentiment more heavily
  let totalPositive = positive + bullish;
  let totalNegative = negative + bearish;
  let total = totalPositive + totalNegative;

  let score = 0;
  if (total > 0) {
    score = (totalPositive - totalNegative) / total;
  }

  let label = 'neutral';
  if (score > 0.1) label = 'positive';
  else if (score < -0.1) label = 'negative';

  return { score, positive, negative, bullish, bearish, label };
}

/**
 * Calculate engagement score for a post (views + likes * 10).
 */
function engagementScore(post) {
  const views = post.views || post.insights?.views || 0;
  const likes = post.likes || post.insights?.likes || 0;
  return views + likes * 10;
}

/**
 * Search Threads keyword_search API for a single keyword.
 */
async function searchKeyword(keyword, token) {
  const url = `${BASE}/keyword_search?q=${encodeURIComponent(keyword)}&media_type=TEXT&access_token=${token}`;
  const data = await fetchJSON(url);
  return data;
}

/**
 * Process search results: score sentiment, aggregate, pick top posts.
 */
function processResults(keyword, rawResponse, financial) {
  const posts = rawResponse.data || [];

  let totalPositive = 0;
  let totalNegative = 0;
  let totalNeutral = 0;
  let totalBullish = 0;
  let totalBearish = 0;
  let weightedScore = 0;
  let totalWeight = 0;
  let totalEngagement = 0;

  const scored = posts.map(post => {
    const text = post.text || '';
    const result = scorePost(text, financial);
    const engagement = engagementScore(post);
    const weight = Math.max(engagement, 1);

    weightedScore += result.score * weight;
    totalWeight += weight;
    totalEngagement += engagement;

    if (result.label === 'positive') totalPositive++;
    else if (result.label === 'negative') totalNegative++;
    else totalNeutral++;

    totalBullish += result.bullish > 0 ? 1 : 0;
    totalBearish += result.bearish > 0 ? 1 : 0;

    return { ...post, _sentiment: result, _engagement: engagement };
  });

  // Top 5 posts by engagement
  const topPosts = scored
    .sort((a, b) => b._engagement - a._engagement)
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      text: p.text?.slice(0, 500),
      timestamp: p.timestamp,
      permalink: p.permalink,
      username: p.username,
      engagement: p._engagement,
      sentiment: p._sentiment.label,
      sentiment_score: p._sentiment.score,
    }));

  const sentimentScore = totalWeight > 0
    ? Math.max(-1, Math.min(1, weightedScore / totalWeight))
    : 0;

  return {
    query: keyword,
    query_type: financial ? 'financial' : 'manual',
    posts_found: posts.length,
    sentiment_score: Math.round(sentimentScore * 1000) / 1000,
    bullish_count: totalBullish,
    bearish_count: totalBearish,
    neutral_count: totalNeutral,
    positive_count: totalPositive,
    negative_count: totalNegative,
    total_engagement: totalEngagement,
    top_posts: topPosts,
  };
}

/**
 * Save search results to the keyword_searches table.
 */
async function saveToDb(result, rawResponse) {
  await query(
    `INSERT INTO keyword_searches (
      query, query_type, posts_found, sentiment_score,
      bullish_count, bearish_count, neutral_count,
      positive_count, negative_count, total_engagement,
      top_posts, raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      result.query,
      result.query_type,
      result.posts_found,
      result.sentiment_score,
      result.bullish_count,
      result.bearish_count,
      result.neutral_count,
      result.positive_count,
      result.negative_count,
      result.total_engagement,
      JSON.stringify(result.top_posts),
      JSON.stringify(rawResponse),
    ]
  );
}

/**
 * Print results in a readable format.
 */
function printResults(result) {
  const bar = result.sentiment_score >= 0
    ? '+'.repeat(Math.round(Math.abs(result.sentiment_score) * 20))
    : '-'.repeat(Math.round(Math.abs(result.sentiment_score) * 20));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Query: "${result.query}" (${result.query_type})`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Posts found:     ${result.posts_found}`);
  console.log(`  Sentiment:       ${result.sentiment_score.toFixed(3)} [${bar || '0'}]`);
  console.log(`  Positive:        ${result.positive_count}`);
  console.log(`  Negative:        ${result.negative_count}`);
  console.log(`  Neutral:         ${result.neutral_count}`);
  if (result.query_type === 'financial') {
    console.log(`  Bullish:         ${result.bullish_count}`);
    console.log(`  Bearish:         ${result.bearish_count}`);
  }
  console.log(`  Engagement:      ${result.total_engagement.toLocaleString()}`);

  if (result.top_posts.length > 0) {
    console.log(`\n  Top posts:`);
    for (const p of result.top_posts) {
      const text = (p.text || '').slice(0, 80).replace(/\n/g, ' ');
      console.log(`    [${p.sentiment}] ${text}...`);
      console.log(`      engagement: ${p.engagement} | ${p.permalink || 'no link'}`);
    }
  }
  console.log();
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  loadEnvIntoProcess(ROOT);

  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) {
    console.error('Error: THREADS_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }

  const keywords = process.argv.slice(2);
  if (keywords.length === 0) {
    console.log('Usage: node scripts/keyword-search.mjs "keyword1" "keyword2" ...');
    console.log('Example: node scripts/keyword-search.mjs "foucault" "AI stocks" "$NVDA"');
    process.exit(0);
  }

  console.log(`Searching ${keywords.length} keyword(s)...`);
  console.log(`Rate limit reminder: 500 searches / 7-day rolling window`);

  for (const keyword of keywords) {
    try {
      const financial = isFinancialQuery(keyword);
      console.log(`\nSearching: "${keyword}" ${financial ? '(financial)' : ''}...`);

      const rawResponse = await searchKeyword(keyword, token);
      const result = processResults(keyword, rawResponse, financial);

      await saveToDb(result, rawResponse);
      printResults(result);

      // Rate-limit courtesy: wait between searches
      if (keywords.indexOf(keyword) < keywords.length - 1) {
        console.log('  Waiting 2s before next search...');
        await sleep(2000);
      }
    } catch (err) {
      console.error(`Error searching "${keyword}":`, err.message);
    }
  }

  await close();
  console.log('Done.');
}

main();
