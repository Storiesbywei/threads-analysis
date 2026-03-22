import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

/**
 * GET /api/reply-sentiment
 *
 * Scores replies from the conversations table using keyword-based sentiment
 * classification. Returns aggregate counts, per-user breakdowns, and recent
 * replies with sentiment labels.
 */

const POSITIVE_WORDS = new Set([
  'love', 'great', 'amazing', 'yes', 'exactly', 'facts', 'based', 'beautiful',
  'fire', 'goat', 'perfect', 'brilliant', 'excellent', 'wonderful', 'awesome',
  'agree', 'true', 'right', 'good', 'best', 'incredible', 'legendary',
  'underrated', 'valid', 'real', 'peak', 'king', 'queen', 'iconic', 'genius',
  'thank', 'thanks', 'appreciate', 'blessed', 'powerful', 'inspiring',
]);

const NEGATIVE_WORDS = new Set([
  'no', 'wrong', 'bad', 'terrible', 'disagree', 'ratio', 'cringe', 'mid',
  'awful', 'worst', 'hate', 'trash', 'stupid', 'dumb', 'boring', 'lame',
  'overrated', 'cap', 'false', 'clown', 'yikes', 'gross', 'embarrassing',
  'pathetic', 'delusional', 'cope', 'nonsense',
]);

type Sentiment = 'positive' | 'negative' | 'neutral';

function classifySentiment(text: string): Sentiment {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  let posCount = 0;
  let negCount = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) posCount++;
    if (NEGATIVE_WORDS.has(word)) negCount++;
  }

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  if (posCount > 0 && negCount > 0) return 'neutral'; // tied
  return 'neutral';
}

export const GET: APIRoute = async () => {
  try {
    // Fetch replies from conversations table
    const result = await query(
      `SELECT
         c.reply_text,
         c.reply_username,
         c.root_post_id,
         c.reply_timestamp,
         t.tag AS root_tag
       FROM conversations c
       LEFT JOIN tags t ON t.post_id = c.root_post_id AND t.is_primary = true
       WHERE c.reply_text IS NOT NULL
         AND c.reply_text != ''
       ORDER BY c.reply_timestamp DESC`,
      []
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return new Response(JSON.stringify({
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        byUser: [],
        byTag: [],
        recentReplies: [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let positive = 0;
    let negative = 0;
    let neutral = 0;

    const userSentiments: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {};
    const tagSentiments: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {};

    interface ScoredReply {
      text: string;
      username: string;
      sentiment: Sentiment;
      rootTag: string | null;
      timestamp: string;
    }

    const recentReplies: ScoredReply[] = [];

    for (const row of rows) {
      const sentiment = classifySentiment(row.reply_text);
      const username = row.reply_username || 'unknown';
      const rootTag = row.root_tag || null;

      if (sentiment === 'positive') positive++;
      else if (sentiment === 'negative') negative++;
      else neutral++;

      // Per-user aggregation
      if (!userSentiments[username]) {
        userSentiments[username] = { positive: 0, negative: 0, neutral: 0, total: 0 };
      }
      userSentiments[username][sentiment]++;
      userSentiments[username].total++;

      // Per-tag aggregation
      if (rootTag) {
        if (!tagSentiments[rootTag]) {
          tagSentiments[rootTag] = { positive: 0, negative: 0, neutral: 0, total: 0 };
        }
        tagSentiments[rootTag][sentiment]++;
        tagSentiments[rootTag].total++;
      }

      // Collect first 50 for recent replies
      if (recentReplies.length < 50) {
        recentReplies.push({
          text: row.reply_text.substring(0, 200),
          username,
          sentiment,
          rootTag,
          timestamp: row.reply_timestamp,
        });
      }
    }

    // Top users by total replies, include sentiment breakdown
    const byUser = Object.entries(userSentiments)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([username, counts]) => ({
        username,
        ...counts,
        dominantSentiment: counts.positive >= counts.negative && counts.positive >= counts.neutral
          ? 'positive' as const
          : counts.negative > counts.positive && counts.negative > counts.neutral
            ? 'negative' as const
            : 'neutral' as const,
      }));

    // Per-tag sentiment breakdown
    const byTag = Object.entries(tagSentiments)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([tag, counts]) => ({
        tag,
        ...counts,
      }));

    return new Response(JSON.stringify({
      total: rows.length,
      positive,
      negative,
      neutral,
      byUser,
      byTag,
      recentReplies,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/reply-sentiment error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
