import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const [syncResult, countResult, latestResult] = await Promise.all([
      query(
        `SELECT id, started_at, finished_at, sync_type, posts_fetched, posts_new,
                posts_updated, metrics_fetched, errors, status
         FROM sync_log
         ORDER BY started_at DESC
         LIMIT 5`,
        []
      ),
      query('SELECT COUNT(*) AS total FROM posts', []),
      query('SELECT MAX(timestamp) AS latest_post FROM posts', []),
    ]);

    return new Response(JSON.stringify({
      total_posts: parseInt(countResult.rows[0].total, 10),
      latest_post_at: latestResult.rows[0].latest_post,
      recent_syncs: syncResult.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/sync-status error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
