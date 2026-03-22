import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const username = url.searchParams.get('username');
    const type = url.searchParams.get('type');
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

    if (username) {
      // Interaction history with a specific user
      const conditions: string[] = [
        '(from_username = $1 OR to_username = $1)',
      ];
      const params: (string | number)[] = [username];
      let paramIndex = 2;

      if (type) {
        conditions.push(`interaction_type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await query(
        `SELECT COUNT(*) AS total FROM interactions WHERE ${whereClause}`,
        params
      );

      const dataResult = await query(
        `SELECT post_id, from_username, to_username, interaction_type, post_text, timestamp
         FROM interactions
         WHERE ${whereClause}
         ORDER BY timestamp DESC NULLS LAST
         LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Also get aggregated stats for this user
      const statsResult = await query(
        `SELECT interaction_type, COUNT(*) AS cnt
         FROM interactions
         WHERE (from_username = $1 OR to_username = $1)
         GROUP BY interaction_type
         ORDER BY cnt DESC`,
        [username]
      );

      return new Response(JSON.stringify({
        username,
        total: parseInt(countResult.rows[0].total, 10),
        by_type: statsResult.rows.reduce((acc: Record<string, number>, r: any) => {
          acc[r.interaction_type] = parseInt(r.cnt, 10);
          return acc;
        }, {}),
        interactions: dataResult.rows,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default: top interacted-with usernames (aggregate view)
    const typeCondition = type ? 'WHERE interaction_type = $1' : '';
    const typeParams: string[] = type ? [type] : [];

    // Overall stats
    const totalResult = await query(
      `SELECT COUNT(*) AS total FROM interactions ${typeCondition}`,
      typeParams
    );
    const uniqueResult = await query(
      `SELECT COUNT(DISTINCT username) AS cnt FROM (
        SELECT from_username AS username FROM interactions ${typeCondition}
        UNION
        SELECT to_username AS username FROM interactions ${typeCondition}
      ) u`,
      [...typeParams, ...typeParams]
    );

    // Type breakdown
    const typeBreakdown = await query(
      `SELECT interaction_type, COUNT(*) AS cnt
       FROM interactions
       GROUP BY interaction_type
       ORDER BY cnt DESC`
    );

    // Top users by interaction count (bidirectional)
    const paramOffset = typeParams.length;
    const topUsers = await query(
      `SELECT username, total_interactions,
              reply_to, mention, commented_on, quoted_by,
              last_interaction
       FROM (
         SELECT
           username,
           COUNT(*) AS total_interactions,
           COUNT(*) FILTER (WHERE interaction_type = 'reply_to') AS reply_to,
           COUNT(*) FILTER (WHERE interaction_type = 'mention') AS mention,
           COUNT(*) FILTER (WHERE interaction_type = 'commented_on') AS commented_on,
           COUNT(*) FILTER (WHERE interaction_type = 'quoted_by') AS quoted_by,
           MAX(timestamp) AS last_interaction
         FROM (
           SELECT to_username AS username, interaction_type, timestamp
           FROM interactions
           WHERE from_username = 'maybe_foucault'
           ${type ? `AND interaction_type = $1` : ''}
           UNION ALL
           SELECT from_username AS username, interaction_type, timestamp
           FROM interactions
           WHERE to_username = 'maybe_foucault' AND from_username <> 'maybe_foucault'
           ${type ? `AND interaction_type = $${paramOffset + 1}` : ''}
         ) combined
         GROUP BY username
       ) agg
       ORDER BY total_interactions DESC
       LIMIT $${paramOffset + 1}`,
      [...typeParams, ...(type ? [type] : []), limit]
    );

    // Most active commenter (someone who comments on your posts most)
    const topCommenter = await query(
      `SELECT from_username, COUNT(*) AS cnt
       FROM interactions
       WHERE interaction_type = 'commented_on' AND to_username = 'maybe_foucault'
       GROUP BY from_username
       ORDER BY cnt DESC
       LIMIT 1`
    );

    // Most replied-to user (user you reply to most)
    const topRepliedTo = await query(
      `SELECT to_username, COUNT(*) AS cnt
       FROM interactions
       WHERE interaction_type = 'reply_to' AND from_username = 'maybe_foucault'
       GROUP BY to_username
       ORDER BY cnt DESC
       LIMIT 1`
    );

    return new Response(JSON.stringify({
      total_interactions: parseInt(totalResult.rows[0].total, 10),
      unique_users: parseInt(uniqueResult.rows[0].cnt, 10),
      by_type: typeBreakdown.rows.reduce((acc: Record<string, number>, r: any) => {
        acc[r.interaction_type] = parseInt(r.cnt, 10);
        return acc;
      }, {}),
      most_active_commenter: topCommenter.rows[0] ? {
        username: topCommenter.rows[0].from_username,
        count: parseInt(topCommenter.rows[0].cnt, 10),
      } : null,
      most_replied_to: topRepliedTo.rows[0] ? {
        username: topRepliedTo.rows[0].to_username,
        count: parseInt(topRepliedTo.rows[0].cnt, 10),
      } : null,
      users: topUsers.rows.map((r: any) => ({
        username: r.username,
        total_interactions: parseInt(r.total_interactions, 10),
        reply_to: parseInt(r.reply_to, 10),
        mention: parseInt(r.mention, 10),
        commented_on: parseInt(r.commented_on, 10),
        quoted_by: parseInt(r.quoted_by, 10),
        last_interaction: r.last_interaction,
      })),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/interactions error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
