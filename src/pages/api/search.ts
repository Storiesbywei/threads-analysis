import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('q');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

    if (!q || q.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter "q" is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await query(
      `SELECT
         p.id, p.text, p.timestamp, p.variety, p.permalink,
         p.word_count, p.char_count, p.has_url, p.has_media,
         p.is_quote_post, p.is_reply,
         ts_rank(to_tsvector('english', COALESCE(p.text, '')), plainto_tsquery('english', $1)) AS rank,
         ss.avg_surprise,
         ml.views, ml.likes, ml.replies AS reply_count, ml.reposts,
         (SELECT t.tag FROM tags t WHERE t.post_id = p.id AND t.is_primary = TRUE LIMIT 1) AS primary_tag,
         COALESCE(
           (SELECT json_agg(t2.tag ORDER BY t2.is_primary DESC) FROM tags t2 WHERE t2.post_id = p.id),
           '[]'::json
         ) AS tags
       FROM posts p
       LEFT JOIN surprise_scores ss ON ss.post_id = p.id
       LEFT JOIN metrics_latest ml ON ml.post_id = p.id
       WHERE to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [q, limit]
    );

    return new Response(JSON.stringify({
      query: q,
      total: result.rowCount,
      posts: result.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/search error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
