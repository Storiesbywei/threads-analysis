import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

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

function isFinancialQuery(keyword: string): boolean {
  if (keyword.startsWith('$')) return true;
  const lower = keyword.toLowerCase();
  const financialTerms = ['stock', 'stocks', 'share', 'shares', 'ticker', 'market',
    'invest', 'trading', 'etf', 'portfolio', 'dividend', 'earnings'];
  return financialTerms.some(t => lower.includes(t));
}

interface SentimentResult {
  score: number;
  positive: number;
  negative: number;
  bullish: number;
  bearish: number;
  label: 'positive' | 'negative' | 'neutral';
}

function scorePost(text: string, financial: boolean = false): SentimentResult {
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

  const totalPositive = positive + bullish;
  const totalNegative = negative + bearish;
  const total = totalPositive + totalNegative;

  let score = 0;
  if (total > 0) {
    score = (totalPositive - totalNegative) / total;
  }

  let label: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (score > 0.1) label = 'positive';
  else if (score < -0.1) label = 'negative';

  return { score, positive, negative, bullish, bearish, label };
}

interface ThreadsPost {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
  username?: string;
  views?: number;
  likes?: number;
  insights?: { views?: number; likes?: number };
}

function engagementScore(post: ThreadsPost): number {
  const views = post.views || post.insights?.views || 0;
  const likes = post.likes || post.insights?.likes || 0;
  return views + likes * 10;
}

// ─── GET /api/keyword-search?q=foucault ──────────────────────

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('q');

    // If requesting history, delegate to history handler
    if (url.pathname.endsWith('/history')) {
      return handleHistory(url);
    }

    if (!q || q.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter "q" is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = import.meta.env.THREADS_ACCESS_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'THREADS_ACCESS_TOKEN not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Call Threads keyword_search API
    const apiUrl = `https://graph.threads.net/v1.0/keyword_search?q=${encodeURIComponent(q)}&media_type=TEXT&access_token=${token}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({
        error: `Threads API error: ${res.status}`,
        details: body,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawResponse = await res.json();
    const posts: ThreadsPost[] = rawResponse.data || [];
    const financial = isFinancialQuery(q);

    // Score each post
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

    // Top 5 by engagement
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

    const result = {
      query: q,
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

    // Save to database
    try {
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
    } catch (dbErr) {
      // Log but don't fail the response if DB save fails
      console.error('Failed to save keyword search to DB:', dbErr instanceof Error ? dbErr.message : dbErr);
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/keyword-search error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// ─── History sub-handler (kept here for related routing) ─────

async function handleHistory(url: URL): Promise<Response> {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

    const result = await query(
      `SELECT id, query, query_type, searched_at, posts_found,
              sentiment_score, bullish_count, bearish_count, neutral_count,
              positive_count, negative_count, total_engagement, top_posts
       FROM keyword_searches
       ORDER BY searched_at DESC
       LIMIT $1`,
      [limit]
    );

    return new Response(JSON.stringify({
      total: result.rowCount,
      searches: result.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/keyword-search/history error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
