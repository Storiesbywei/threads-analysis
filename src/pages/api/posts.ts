import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const tag = url.searchParams.get('tag');
    const subTag = url.searchParams.get('sub_tag');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const surpriseMin = url.searchParams.get('surprise_min');
    const surpriseMax = url.searchParams.get('surprise_max');
    const variety = url.searchParams.get('variety');
    const q = url.searchParams.get('q');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const sort = url.searchParams.get('sort') || 'timestamp';
    const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    // Validate sort column to prevent injection
    const allowedSorts: Record<string, string> = {
      timestamp: 'p.timestamp',
      surprise: 'ss.avg_surprise',
      views: 'ml.views',
      likes: 'ml.likes',
      replies: 'ml.replies',
      word_count: 'p.word_count',
    };
    const sortColumn = allowedSorts[sort] || 'p.timestamp';

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (tag) {
      conditions.push(`EXISTS (SELECT 1 FROM tags t2 WHERE t2.post_id = p.id AND t2.tag = $${paramIndex})`);
      params.push(tag);
      paramIndex++;
    }

    if (subTag) {
      conditions.push(`EXISTS (SELECT 1 FROM sub_tags st2 WHERE st2.post_id = p.id AND st2.sub_tag = $${paramIndex})`);
      params.push(subTag);
      paramIndex++;
    }

    if (from) {
      conditions.push(`p.timestamp >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      conditions.push(`p.timestamp <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    if (surpriseMin) {
      conditions.push(`ss.avg_surprise >= $${paramIndex}`);
      params.push(parseFloat(surpriseMin));
      paramIndex++;
    }

    if (surpriseMax) {
      conditions.push(`ss.avg_surprise <= $${paramIndex}`);
      params.push(parseFloat(surpriseMax));
      paramIndex++;
    }

    if (variety) {
      conditions.push(`p.variety = $${paramIndex}`);
      params.push(variety);
      paramIndex++;
    }

    if (q) {
      conditions.push(`to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', $${paramIndex})`);
      params.push(q);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await query(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM posts p
       LEFT JOIN surprise_scores ss ON ss.post_id = p.id
       LEFT JOIN metrics_latest ml ON ml.post_id = p.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Data query
    const dataResult = await query(
      `SELECT
         p.id, p.text, p.media_type, p.permalink, p.timestamp,
         p.variety, p.word_count, p.char_count, p.has_url, p.has_media,
         p.is_quote_post, p.is_reply, p.is_repost,
         ss.surprise, ss.avg_surprise,
         ml.views, ml.likes, ml.replies AS reply_count, ml.reposts, ml.quotes, ml.shares,
         COALESCE(
           (SELECT json_agg(t2.tag ORDER BY t2.is_primary DESC) FROM tags t2 WHERE t2.post_id = p.id),
           '[]'::json
         ) AS tags,
         COALESCE(
           (SELECT json_agg(st2.sub_tag) FROM sub_tags st2 WHERE st2.post_id = p.id),
           '[]'::json
         ) AS sub_tags,
         (SELECT t3.tag FROM tags t3 WHERE t3.post_id = p.id AND t3.is_primary = TRUE LIMIT 1) AS primary_tag
       FROM posts p
       LEFT JOIN surprise_scores ss ON ss.post_id = p.id
       LEFT JOIN metrics_latest ml ON ml.post_id = p.id
       ${whereClause}
       ORDER BY ${sortColumn} ${order} NULLS LAST
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return new Response(JSON.stringify({
      posts: dataResult.rows,
      total,
      page,
      limit,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/posts error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
