import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

/**
 * GET /api/keyword-history?q=foucault&limit=10
 *
 * Returns past keyword searches with sentiment trends over time.
 * If `q` is provided, filters to that specific query term.
 * Otherwise returns all recent searches grouped by query.
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('q');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));

    if (q) {
      // Return history for a specific query term
      const result = await query(
        `SELECT id, query, query_type, searched_at, posts_found,
                sentiment_score, bullish_count, bearish_count, neutral_count,
                positive_count, negative_count, total_engagement, top_posts
         FROM keyword_searches
         WHERE query = $1
         ORDER BY searched_at DESC
         LIMIT $2`,
        [q, limit]
      );

      // Compute trend data
      const rows = result.rows;
      let trend: 'up' | 'down' | 'stable' | 'insufficient_data' = 'insufficient_data';
      let avgSentiment = 0;
      let sentimentChange = 0;

      if (rows.length >= 2) {
        const recent = rows.slice(0, Math.ceil(rows.length / 2));
        const older = rows.slice(Math.ceil(rows.length / 2));

        const recentAvg = recent.reduce((sum: number, r: { sentiment_score: number }) => sum + (r.sentiment_score || 0), 0) / recent.length;
        const olderAvg = older.reduce((sum: number, r: { sentiment_score: number }) => sum + (r.sentiment_score || 0), 0) / older.length;

        sentimentChange = Math.round((recentAvg - olderAvg) * 1000) / 1000;
        avgSentiment = Math.round(recentAvg * 1000) / 1000;

        if (sentimentChange > 0.05) trend = 'up';
        else if (sentimentChange < -0.05) trend = 'down';
        else trend = 'stable';
      } else if (rows.length === 1) {
        avgSentiment = Math.round((rows[0].sentiment_score || 0) * 1000) / 1000;
      }

      return new Response(JSON.stringify({
        query: q,
        total: result.rowCount,
        trend,
        avg_sentiment: avgSentiment,
        sentiment_change: sentimentChange,
        searches: rows,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // No query specified: return recent searches grouped by query
    const result = await query(
      `SELECT
         query,
         query_type,
         COUNT(*)::int AS search_count,
         ROUND(AVG(sentiment_score)::numeric, 3) AS avg_sentiment,
         ROUND(AVG(posts_found)::numeric, 1) AS avg_posts_found,
         SUM(total_engagement)::int AS total_engagement,
         MAX(searched_at) AS last_searched,
         MIN(searched_at) AS first_searched
       FROM keyword_searches
       GROUP BY query, query_type
       ORDER BY MAX(searched_at) DESC
       LIMIT $1`,
      [limit]
    );

    return new Response(JSON.stringify({
      total: result.rowCount,
      queries: result.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/keyword-history error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
