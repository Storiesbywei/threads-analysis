import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const parent = url.searchParams.get('parent');

    if (parent) {
      // Return sub-tags for a specific parent tag
      const result = await query(
        `SELECT sub_tag, COUNT(*) AS count
         FROM sub_tags
         WHERE parent_tag = $1
         GROUP BY sub_tag
         ORDER BY count DESC`,
        [parent]
      );
      return new Response(JSON.stringify({
        parent,
        sub_tags: result.rows,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return all tag counts
    const result = await query(
      `SELECT tag, COUNT(*) AS count
       FROM tags
       GROUP BY tag
       ORDER BY count DESC`,
      []
    );

    return new Response(JSON.stringify({
      tags: result.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/tags error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
