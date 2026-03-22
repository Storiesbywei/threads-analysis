import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

/**
 * GET /api/voice-consistency
 *
 * Tracks brand voice consistency over time by computing monthly:
 *   - Type-Token Ratio (TTR): unique words / total words
 *   - Average word count per post
 *   - Tag entropy: Shannon entropy of the tag distribution that month
 *
 * Higher TTR = more diverse vocabulary = less predictable voice.
 * Lower tag entropy = more focused topic coverage.
 */

function log2(x: number): number {
  return x === 0 ? 0 : Math.log2(x);
}

function shannonEntropy(counts: Record<string, number>): number {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(counts)) {
    const p = c / total;
    if (p > 0) h -= p * log2(p);
  }
  return h;
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\w+\.\w{2,}\/\S*/g, ' ')
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

export const GET: APIRoute = async () => {
  try {
    // Fetch posts with text, timestamp, and primary tag
    const result = await query(
      `SELECT
         p.id,
         p.text,
         p.timestamp,
         t.tag AS primary_tag
       FROM posts p
       JOIN tags t ON t.post_id = p.id AND t.is_primary = true
       WHERE p.text IS NOT NULL
         AND p.text != ''
         AND p.media_type != 'REPOST_FACADE'
       ORDER BY p.timestamp ASC`,
      []
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ months: [], post_count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Group posts by month
    const monthlyData: Record<string, {
      texts: string[];
      tags: string[];
      wordCounts: number[];
    }> = {};

    for (const row of rows) {
      const d = new Date(row.timestamp);
      const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { texts: [], tags: [], wordCounts: [] };
      }

      const words = tokenize(row.text);
      monthlyData[monthKey].texts.push(row.text);
      monthlyData[monthKey].tags.push(row.primary_tag);
      monthlyData[monthKey].wordCounts.push(words.length);
    }

    // Compute per-month metrics
    const months: {
      month: string;
      ttr: number;
      avgWordCount: number;
      tagEntropy: number;
      postCount: number;
      uniqueWords: number;
      totalWords: number;
    }[] = [];

    const sortedMonths = Object.keys(monthlyData).sort();

    for (const monthKey of sortedMonths) {
      const data = monthlyData[monthKey];

      // Skip months with very few posts
      if (data.texts.length < 5) continue;

      // Compute TTR: unique words / total words
      const allWords: string[] = [];
      const uniqueWordSet = new Set<string>();

      for (const text of data.texts) {
        const words = tokenize(text);
        for (const w of words) {
          allWords.push(w);
          uniqueWordSet.add(w);
        }
      }

      const totalWords = allWords.length;
      const uniqueWords = uniqueWordSet.size;
      const ttr = totalWords > 0 ? uniqueWords / totalWords : 0;

      // Average word count per post
      const avgWordCount = data.wordCounts.length > 0
        ? data.wordCounts.reduce((a, b) => a + b, 0) / data.wordCounts.length
        : 0;

      // Tag entropy for this month
      const tagCounts: Record<string, number> = {};
      for (const tag of data.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
      const tagEntropy = shannonEntropy(tagCounts);

      months.push({
        month: monthKey,
        ttr: Math.round(ttr * 10000) / 10000,
        avgWordCount: Math.round(avgWordCount * 10) / 10,
        tagEntropy: Math.round(tagEntropy * 10000) / 10000,
        postCount: data.texts.length,
        uniqueWords,
        totalWords,
      });
    }

    return new Response(JSON.stringify({
      post_count: rows.length,
      month_count: months.length,
      months,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/voice-consistency error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
