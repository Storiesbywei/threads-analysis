import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const metric = url.searchParams.get('metric') || 'views';

    // Validate metric parameter
    const allowedMetrics = ['views', 'likes'];
    if (!allowedMetrics.includes(metric)) {
      return new Response(JSON.stringify({ error: `Invalid metric: ${metric}. Allowed: ${allowedMetrics.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await query(
      `SELECT
        EXTRACT(DOW FROM p.timestamp) AS day_of_week,
        EXTRACT(HOUR FROM p.timestamp) AS hour,
        COUNT(*) AS post_count,
        AVG(m.views) AS avg_views,
        AVG(m.likes) AS avg_likes
      FROM posts p
      JOIN metrics_latest m ON m.post_id = p.id
      WHERE p.variety = 'original'
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour`,
      []
    );

    const cells = result.rows.map((row: any) => ({
      day: Number(row.day_of_week),
      hour: Number(row.hour),
      count: Number(row.post_count),
      avg: Number(metric === 'views' ? row.avg_views : row.avg_likes),
    }));

    return new Response(JSON.stringify({
      metric,
      cells,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/engagement-heatmap error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
