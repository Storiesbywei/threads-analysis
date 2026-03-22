import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const typesParam = url.searchParams.get('types');
    const minWeight = url.searchParams.get('min_weight');

    // Build nodes query
    let nodesSQL = 'SELECT id, label, node_type, post_count, size, color FROM kg_nodes';
    const nodesParams: string[] = [];

    if (typesParam) {
      const types = typesParam.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        const placeholders = types.map((_, i) => `$${i + 1}`).join(', ');
        nodesSQL += ` WHERE node_type IN (${placeholders})`;
        nodesParams.push(...types);
      }
    }

    nodesSQL += ' ORDER BY post_count DESC NULLS LAST';

    // Build edges query
    let edgesSQL = 'SELECT source, target, edge_type, weight, count FROM kg_edges';
    const edgesParams: (string | number)[] = [];
    const edgesConditions: string[] = [];

    if (minWeight) {
      edgesConditions.push(`weight >= $${edgesParams.length + 1}`);
      edgesParams.push(parseFloat(minWeight));
    }

    // If filtering nodes by type, also filter edges to only include those nodes
    if (typesParam) {
      const types = typesParam.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        const sourcePlaceholders = types.map((_, i) => `$${edgesParams.length + i + 1}`).join(', ');
        edgesParams.push(...types);
        const targetPlaceholders = types.map((_, i) => `$${edgesParams.length + i + 1}`).join(', ');
        edgesParams.push(...types);
        edgesConditions.push(
          `source IN (SELECT id FROM kg_nodes WHERE node_type IN (${sourcePlaceholders}))` +
          ` AND target IN (SELECT id FROM kg_nodes WHERE node_type IN (${targetPlaceholders}))`
        );
      }
    }

    if (edgesConditions.length > 0) {
      edgesSQL += ` WHERE ${edgesConditions.join(' AND ')}`;
    }

    edgesSQL += ' ORDER BY weight DESC NULLS LAST';

    const [nodesResult, edgesResult] = await Promise.all([
      query(nodesSQL, nodesParams),
      query(edgesSQL, edgesParams),
    ]);

    return new Response(JSON.stringify({
      nodes: nodesResult.rows,
      edges: edgesResult.rows,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/graph error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
