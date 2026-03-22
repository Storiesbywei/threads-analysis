import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const tagParam = url.searchParams.get('tag');
    const months = url.searchParams.get('months');
    const limit = parseInt(url.searchParams.get('limit') || '0', 10);

    const conditions: string[] = [
      "p.text IS NOT NULL",
      "p.media_type != 'REPOST_FACADE'",
    ];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Support comma-separated tags: ?tag=philosophy,tech,political
    if (tagParam) {
      const tags = tagParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length === 1) {
        conditions.push(`t.tag = $${paramIndex}`);
        params.push(tags[0]);
        paramIndex++;
      } else if (tags.length > 1) {
        const placeholders = tags.map((_, i) => `$${paramIndex + i}`).join(',');
        conditions.push(`t.tag IN (${placeholders})`);
        params.push(...tags);
        paramIndex += tags.length;
      }
    }

    if (months) {
      const m = parseInt(months, 10);
      if (m > 0) {
        conditions.push(`p.timestamp >= NOW() - INTERVAL '${m} months'`);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    // First get total count matching filters
    const countResult = await query(
      `SELECT COUNT(*) as total FROM posts p
       LEFT JOIN tags t ON t.post_id = p.id AND t.is_primary = true
       ${whereClause}`,
      params
    );
    const totalMatching = parseInt(countResult.rows[0].total, 10);

    // Sample evenly across the full timeline if limit is set
    // This ensures the garden shows the complete growth shape, not just the first N posts
    let sampleClause = '';
    if (limit > 0 && totalMatching > limit) {
      // Use modulo sampling: keep every Nth row to get ~limit rows spread across time
      const nth = Math.ceil(totalMatching / limit);
      sampleClause = `AND (ROW_NUMBER() OVER (ORDER BY p.timestamp ASC)) % ${nth} = 0`;
    }

    // If we need sampling, wrap in a subquery
    const needsSampling = limit > 0 && totalMatching > limit;
    const nth = needsSampling ? Math.ceil(totalMatching / limit) : 1;

    const sql = needsSampling
      ? `SELECT * FROM (
           SELECT
             p.id,
             EXTRACT(EPOCH FROM p.timestamp) * 1000 AS timestamp,
             p.variety,
             p.word_count,
             LEFT(p.text, 120) AS text_preview,
             p.reply_to_id,
             p.quoted_post_id,
             t.tag AS primary_tag,
             ss.avg_surprise,
             ROW_NUMBER() OVER (ORDER BY p.timestamp ASC) as rn
           FROM posts p
           LEFT JOIN tags t ON t.post_id = p.id AND t.is_primary = true
           LEFT JOIN surprise_scores ss ON ss.post_id = p.id
           ${whereClause}
         ) sub WHERE sub.rn % ${nth} = 0
         ORDER BY timestamp ASC`
      : `SELECT
           p.id,
           EXTRACT(EPOCH FROM p.timestamp) * 1000 AS timestamp,
           p.variety,
           p.word_count,
           LEFT(p.text, 120) AS text_preview,
           p.reply_to_id,
           p.quoted_post_id,
           t.tag AS primary_tag,
           ss.avg_surprise
         FROM posts p
         LEFT JOIN tags t ON t.post_id = p.id AND t.is_primary = true
         LEFT JOIN surprise_scores ss ON ss.post_id = p.id
         ${whereClause}
         ORDER BY p.timestamp ASC`;

    const result = await query(sql, params);

    const nodes = result.rows.map((row: any) => ({
      id: row.id,
      timestamp: Number(row.timestamp),
      variety: row.variety || 'original',
      tag: row.primary_tag || 'reaction',
      surprise: row.avg_surprise ? parseFloat(row.avg_surprise) : 0,
      wordCount: row.word_count || 0,
      replyToId: row.reply_to_id || null,
      quotedPostId: row.quoted_post_id || null,
      textPreview: row.text_preview || '',
    }));

    let minTs = Infinity, maxTs = -Infinity;
    for (const n of nodes) {
      if (n.timestamp < minTs) minTs = n.timestamp;
      if (n.timestamp > maxTs) maxTs = n.timestamp;
    }
    if (minTs === Infinity) minTs = Date.now() - 86400000;
    if (maxTs === -Infinity) maxTs = Date.now();

    return new Response(JSON.stringify({
      nodes,
      totalPosts: nodes.length,
      dateRange: { min: minTs, max: maxTs },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/garden-tree error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
