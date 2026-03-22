import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const postId = url.searchParams.get('post_id');
    const top = Math.min(100, Math.max(1, parseInt(url.searchParams.get('top') || '20', 10)));
    const sort = url.searchParams.get('sort') || 'views';

    // Time-series for a single post
    if (postId) {
      const result = await query(
        `SELECT fetched_at, views, likes, replies, reposts, quotes, shares
         FROM metrics
         WHERE post_id = $1
         ORDER BY fetched_at ASC`,
        [postId]
      );

      // Also fetch the post text for context
      const postResult = await query(
        `SELECT id, text, timestamp, variety, permalink FROM posts WHERE id = $1`,
        [postId]
      );

      return new Response(JSON.stringify({
        post: postResult.rows[0] || null,
        metrics: result.rows,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Top posts by metric (uses materialized view)
    const allowedSorts: Record<string, string> = {
      views: 'ml.views',
      likes: 'ml.likes',
      replies: 'ml.replies',
      reposts: 'ml.reposts',
      quotes: 'ml.quotes',
      shares: 'ml.shares',
    };
    const sortColumn = allowedSorts[sort] || 'ml.views';

    const result = await query(
      `SELECT
         p.id, p.text, p.timestamp, p.variety, p.permalink,
         ml.views, ml.likes, ml.replies, ml.reposts, ml.quotes, ml.shares, ml.fetched_at,
         (SELECT t.tag FROM tags t WHERE t.post_id = p.id AND t.is_primary = TRUE LIMIT 1) AS primary_tag
       FROM metrics_latest ml
       JOIN posts p ON p.id = ml.post_id
       WHERE ${sortColumn} IS NOT NULL
       ORDER BY ${sortColumn} DESC
       LIMIT $1`,
      [top]
    );

    return new Response(JSON.stringify({
      sort,
      posts: result.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/metrics error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
