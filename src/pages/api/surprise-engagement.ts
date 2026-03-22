import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

/**
 * GET /api/surprise-engagement?metric=views&limit=500
 *
 * Returns scatter plot data: surprise (bits/word) vs engagement metric,
 * plus the Pearson correlation coefficient.
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const metric = url.searchParams.get('metric') || 'views';
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '500', 10) || 500,
      5000
    );

    // Validate metric param
    const allowedMetrics = ['views', 'likes', 'replies', 'reposts', 'quotes'];
    if (!allowedMetrics.includes(metric)) {
      return new Response(
        JSON.stringify({ error: `Invalid metric. Allowed: ${allowedMetrics.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await query(
      `SELECT
        p.id,
        LEFT(p.text, 100) AS text_preview,
        p.timestamp,
        ss.avg_surprise AS surprise,
        m.views,
        m.likes,
        t.tag AS primary_tag
      FROM posts p
      JOIN surprise_scores ss ON ss.post_id = p.id
      JOIN metrics_latest m ON m.post_id = p.id
      LEFT JOIN tags t ON t.post_id = p.id AND t.is_primary = true
      WHERE ss.avg_surprise > 0 AND m.${metric} > 0
      ORDER BY m.${metric} DESC
      LIMIT $1`,
      [limit]
    );

    const points = result.rows.map((row: any) => ({
      id: row.id,
      surprise: parseFloat(row.surprise),
      views: row.views != null ? parseInt(row.views, 10) : null,
      likes: row.likes != null ? parseInt(row.likes, 10) : null,
      tag: row.primary_tag || 'uncategorized',
      text_preview: row.text_preview || '',
      timestamp: row.timestamp,
    }));

    // Compute Pearson correlation coefficient between surprise and the chosen metric
    const pairs = points.filter(
      (p: any) => p.surprise != null && p[metric] != null
    );
    const n = pairs.length;
    let correlation = 0;

    if (n > 2) {
      const sumX = pairs.reduce((s: number, p: any) => s + p.surprise, 0);
      const sumY = pairs.reduce((s: number, p: any) => s + p[metric], 0);
      const sumXY = pairs.reduce(
        (s: number, p: any) => s + p.surprise * p[metric],
        0
      );
      const sumX2 = pairs.reduce(
        (s: number, p: any) => s + p.surprise * p.surprise,
        0
      );
      const sumY2 = pairs.reduce(
        (s: number, p: any) => s + p[metric] * p[metric],
        0
      );

      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt(
        (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
      );

      correlation = denominator !== 0 ? numerator / denominator : 0;
    }

    return new Response(
      JSON.stringify({
        metric,
        correlation: Math.round(correlation * 1000) / 1000,
        count: points.length,
        points,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/surprise-engagement error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
