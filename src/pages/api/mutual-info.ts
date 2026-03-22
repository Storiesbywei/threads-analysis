import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

/**
 * Mutual Information API — computes I(X;Y) between tag and temporal/structural features.
 *
 * Returns MI for four feature pairs:
 *   - tag x hour_of_day
 *   - tag x day_of_week
 *   - tag x post_length (bucketed: micro/short/medium/long/essay)
 *   - tag x is_quote_post
 *
 * MI formula: I(X;Y) = H(X) + H(Y) - H(X,Y)
 * Normalized MI: I(X;Y) / min(H(X), H(Y))  — bounded [0, 1]
 */

// ── Pure info-theory helpers (mirrors info-theory-lib.mjs) ──

function log2(x: number): number {
  return x === 0 ? 0 : Math.log2(x);
}

function entropy(counts: Record<string, number>): number {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(counts)) {
    const p = c / total;
    if (p > 0) h -= p * log2(p);
  }
  return h;
}

function mutualInformation(
  xCounts: Record<string, number>,
  yCounts: Record<string, number>,
  jointCounts: Record<string, number>,
): number {
  return entropy(xCounts) + entropy(yCounts) - entropy(jointCounts);
}

function normalizedMI(
  xCounts: Record<string, number>,
  yCounts: Record<string, number>,
  jointCounts: Record<string, number>,
): number {
  const hx = entropy(xCounts);
  const hy = entropy(yCounts);
  const minH = Math.min(hx, hy);
  if (minH === 0) return 0;
  return mutualInformation(xCounts, yCounts, jointCounts) / minH;
}

// ── Length bucket (matches information-theory.mjs logic) ──

function lengthBucket(charCount: number): string {
  if (charCount < 20) return 'micro';
  if (charCount < 50) return 'short';
  if (charCount < 150) return 'medium';
  if (charCount < 500) return 'long';
  return 'essay';
}

// ── Route handler ──

export const GET: APIRoute = async () => {
  try {
    // Fetch posts joined with their primary tag
    const result = await query(
      `SELECT
         p.id,
         p.timestamp,
         p.char_count,
         p.word_count,
         p.is_quote_post,
         t.tag AS primary_tag
       FROM posts p
       JOIN tags t ON t.post_id = p.id AND t.is_primary = true
       WHERE p.text IS NOT NULL
         AND p.media_type != 'REPOST_FACADE'`,
      []
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ pairs: [], post_count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Build count tables ──

    const tagCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};
    const dowCounts: Record<string, number> = {};
    const lenCounts: Record<string, number> = {};
    const quoteCounts: Record<string, number> = {};

    const jointTagHour: Record<string, number> = {};
    const jointTagDow: Record<string, number> = {};
    const jointTagLen: Record<string, number> = {};
    const jointTagQuote: Record<string, number> = {};

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const row of rows) {
      const tag = row.primary_tag;
      const d = new Date(row.timestamp);
      const hour = String(d.getUTCHours()).padStart(2, '0');
      const dow = DOW[d.getUTCDay()];
      const len = lengthBucket(row.char_count ?? 0);
      const quote = row.is_quote_post ? 'quote' : 'original';

      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dowCounts[dow] = (dowCounts[dow] || 0) + 1;
      lenCounts[len] = (lenCounts[len] || 0) + 1;
      quoteCounts[quote] = (quoteCounts[quote] || 0) + 1;

      jointTagHour[`${tag}|${hour}`] = (jointTagHour[`${tag}|${hour}`] || 0) + 1;
      jointTagDow[`${tag}|${dow}`] = (jointTagDow[`${tag}|${dow}`] || 0) + 1;
      jointTagLen[`${tag}|${len}`] = (jointTagLen[`${tag}|${len}`] || 0) + 1;
      jointTagQuote[`${tag}|${quote}`] = (jointTagQuote[`${tag}|${quote}`] || 0) + 1;
    }

    // ── Compute MI pairs ──

    const pairs = [
      {
        x: 'tag',
        y: 'hour',
        mi: +mutualInformation(tagCounts, hourCounts, jointTagHour).toFixed(6),
        normalized_mi: +normalizedMI(tagCounts, hourCounts, jointTagHour).toFixed(6),
      },
      {
        x: 'tag',
        y: 'day_of_week',
        mi: +mutualInformation(tagCounts, dowCounts, jointTagDow).toFixed(6),
        normalized_mi: +normalizedMI(tagCounts, dowCounts, jointTagDow).toFixed(6),
      },
      {
        x: 'tag',
        y: 'post_length',
        mi: +mutualInformation(tagCounts, lenCounts, jointTagLen).toFixed(6),
        normalized_mi: +normalizedMI(tagCounts, lenCounts, jointTagLen).toFixed(6),
      },
      {
        x: 'tag',
        y: 'is_quote',
        mi: +mutualInformation(tagCounts, quoteCounts, jointTagQuote).toFixed(6),
        normalized_mi: +normalizedMI(tagCounts, quoteCounts, jointTagQuote).toFixed(6),
      },
    ];

    return new Response(JSON.stringify({
      post_count: rows.length,
      pairs,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/mutual-info error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
