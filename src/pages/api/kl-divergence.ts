import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

/**
 * GET /api/kl-divergence?window=week
 *
 * Computes KL divergence between each week's tag distribution and the overall
 * corpus baseline. Spikes indicate "voice deviation" periods where posting
 * behavior was statistically unusual.
 *
 * KL(P_week || P_overall) = sum_t P_week(t) * log2(P_week(t) / P_overall(t))
 * Uses Laplace smoothing to avoid log(0).
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const window = url.searchParams.get('window') || 'week';

    if (window !== 'week') {
      return new Response(
        JSON.stringify({ error: 'Only window=week is currently supported' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all posts with their primary tag and timestamp
    const result = await query(
      `SELECT
         p.id,
         p.timestamp,
         t.tag AS primary_tag
       FROM posts p
       JOIN tags t ON t.post_id = p.id AND t.is_primary = true
       WHERE p.text IS NOT NULL
         AND p.media_type != 'REPOST_FACADE'
       ORDER BY p.timestamp ASC`,
      []
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ weeks: [], post_count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build overall tag distribution
    const overallCounts: Record<string, number> = {};
    const weeklyPosts: Record<string, { tag: string }[]> = {};

    // Collect all unique tags for Laplace smoothing
    const allTags = new Set<string>();

    for (const row of rows) {
      const tag = row.primary_tag;
      allTags.add(tag);
      overallCounts[tag] = (overallCounts[tag] || 0) + 1;

      // ISO week key: YYYY-Www
      const d = new Date(row.timestamp);
      const weekKey = getISOWeekKey(d);

      if (!weeklyPosts[weekKey]) weeklyPosts[weekKey] = [];
      weeklyPosts[weekKey].push({ tag });
    }

    const totalPosts = rows.length;
    const tagCount = allTags.size;
    const tagList = Array.from(allTags);

    // Overall distribution with Laplace smoothing
    const qSmoothed: Record<string, number> = {};
    for (const tag of tagList) {
      qSmoothed[tag] = ((overallCounts[tag] || 0) + 1) / (totalPosts + tagCount);
    }

    // Compute KL divergence for each week
    const weeks: {
      week: string;
      kl: number;
      topDrift: string;
      postCount: number;
      topDriftContribution: number;
    }[] = [];

    const sortedWeekKeys = Object.keys(weeklyPosts).sort();

    for (const weekKey of sortedWeekKeys) {
      const posts = weeklyPosts[weekKey];
      const weekCount = posts.length;

      // Skip weeks with very few posts (unreliable distribution)
      if (weekCount < 3) continue;

      // Weekly tag counts
      const weekCounts: Record<string, number> = {};
      for (const p of posts) {
        weekCounts[p.tag] = (weekCounts[p.tag] || 0) + 1;
      }

      // Weekly distribution with Laplace smoothing
      let kl = 0;
      let maxContribution = 0;
      let topDriftTag = '';

      for (const tag of tagList) {
        const pSmoothed = ((weekCounts[tag] || 0) + 1) / (weekCount + tagCount);
        const q = qSmoothed[tag];

        // KL contribution: p * log2(p/q)
        const contribution = pSmoothed * Math.log2(pSmoothed / q);
        kl += contribution;

        if (contribution > maxContribution) {
          maxContribution = contribution;
          topDriftTag = tag;
        }
      }

      weeks.push({
        week: weekKey,
        kl: Math.round(kl * 10000) / 10000,
        topDrift: topDriftTag,
        postCount: weekCount,
        topDriftContribution: Math.round(maxContribution * 10000) / 10000,
      });
    }

    return new Response(
      JSON.stringify({
        window,
        post_count: totalPosts,
        tag_count: tagCount,
        week_count: weeks.length,
        weeks,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/kl-divergence error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * Returns ISO week key like "2024-W32" for a given date.
 */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
