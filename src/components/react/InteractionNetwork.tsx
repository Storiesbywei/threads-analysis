import { useRef, useEffect, useState, useCallback } from 'react';
import ForceGraph2D from 'force-graph';

interface InteractionUser {
  username: string;
  total_interactions: number;
  reply_to: number;
  mention: number;
  commented_on: number;
  quoted_by: number;
  last_interaction: string | null;
}

interface ApiResponse {
  total_interactions: number;
  unique_users: number;
  by_type: Record<string, number>;
  most_active_commenter: { username: string; count: number } | null;
  most_replied_to: { username: string; count: number } | null;
  users: InteractionUser[];
}

interface GraphNode {
  id: string;
  label: string;
  size: number;
  color: string;
  fx?: number;
  fy?: number;
  totalInteractions: number;
  lastInteraction: string | null;
  reply_to: number;
  mention: number;
  commented_on: number;
  quoted_by: number;
}

interface GraphLink {
  source: string;
  target: string;
  color: string;
  width: number;
  type: string;
}

const CENTER_USER = 'maybe_foucault';

const TYPE_COLORS: Record<string, string> = {
  reply_to: '#58a6ff',     // blue
  commented_on: '#3fb950',  // green
  quoted_by: '#d29922',     // orange
  mention: '#bc8cff',       // purple
};

function dominantType(user: InteractionUser): string {
  const types = [
    { type: 'reply_to', count: user.reply_to },
    { type: 'commented_on', count: user.commented_on },
    { type: 'quoted_by', count: user.quoted_by },
    { type: 'mention', count: user.mention },
  ];
  types.sort((a, b) => b.count - a.count);
  return types[0].count > 0 ? types[0].type : 'reply_to';
}

function buildGraph(data: ApiResponse) {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Center node
  nodes.push({
    id: CENTER_USER,
    label: `@${CENTER_USER}`,
    size: 24,
    color: '#f0f6fc',
    fx: 0,
    fy: 0,
    totalInteractions: data.total_interactions,
    lastInteraction: null,
    reply_to: 0,
    mention: 0,
    commented_on: 0,
    quoted_by: 0,
  });

  const maxInteractions = Math.max(...data.users.map((u) => u.total_interactions), 1);

  for (const user of data.users) {
    const dominant = dominantType(user);
    const nodeColor = TYPE_COLORS[dominant] || '#6e7681';
    const nodeSize = 3 + (user.total_interactions / maxInteractions) * 15;

    nodes.push({
      id: user.username,
      label: `@${user.username}`,
      size: nodeSize,
      color: nodeColor,
      totalInteractions: user.total_interactions,
      lastInteraction: user.last_interaction,
      reply_to: user.reply_to,
      mention: user.mention,
      commented_on: user.commented_on,
      quoted_by: user.quoted_by,
    });

    // Create links for each interaction type
    const typeEntries = [
      { type: 'reply_to', count: user.reply_to },
      { type: 'commented_on', count: user.commented_on },
      { type: 'quoted_by', count: user.quoted_by },
      { type: 'mention', count: user.mention },
    ].filter((e) => e.count > 0);

    if (typeEntries.length === 0) continue;

    // Use dominant type for the main link
    const mainType = typeEntries.sort((a, b) => b.count - a.count)[0];
    links.push({
      source: CENTER_USER,
      target: user.username,
      color: TYPE_COLORS[mainType.type] || '#6e7681',
      width: Math.max(0.5, Math.min(6, (user.total_interactions / maxInteractions) * 6)),
      type: mainType.type,
    });
  }

  return { nodes, links };
}

export default function InteractionNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphInstanceRef = useRef<any>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/interactions?limit=200');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    containerRef.current.innerHTML = '';

    const { nodes, links } = buildGraph(data);
    const width = containerRef.current.clientWidth || 800;

    const graph = new ForceGraph2D(containerRef.current)
      .graphData({ nodes, links })
      .backgroundColor('#0d1117')
      .width(width)
      .height(600)
      .nodeColor((node: any) => node.color)
      .nodeVal((node: any) => node.size)
      .nodeLabel('')
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.label;
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${fontSize}px 'SF Mono', 'Fira Code', monospace`;
        ctx.fillStyle = node.id === CENTER_USER ? '#f0f6fc' : '#8b949e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const r = Math.sqrt(node.size) * 2;
        if (globalScale > 0.6 || node.id === CENTER_USER) {
          ctx.fillText(label, node.x, node.y + r + 2);
        }
      })
      .linkColor((link: any) => {
        const alpha = Math.max(0.15, Math.min(0.7, link.width / 6));
        const base = link.color || '#58a6ff';
        // Parse hex to rgba
        const r = parseInt(base.slice(1, 3), 16);
        const g = parseInt(base.slice(3, 5), 16);
        const b = parseInt(base.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      })
      .linkWidth((link: any) => link.width)
      .onNodeHover((node: any) => {
        setHoveredNode(node || null);
        if (containerRef.current) {
          containerRef.current.style.cursor = node ? 'pointer' : 'default';
        }
      })
      .cooldownTicks(150)
      .d3AlphaDecay(0.02)
      .d3VelocityDecay(0.3)
      .d3Force('charge', null);

    // Custom charge force for spread
    const d3 = (graph as any).d3Force;
    if (d3) {
      // Use built-in method to configure forces
    }
    graph.d3Force('charge')?.strength?.(-100);

    graphInstanceRef.current = graph;

    const handleResize = () => {
      if (containerRef.current) {
        graph.width(containerRef.current.clientWidth);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        graph._destructor();
      } catch {
        // force-graph destructor may throw
      }
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#6e7681', fontFamily: "'SF Mono', monospace" }}>
        Loading interaction data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#f85149', fontFamily: "'SF Mono', monospace" }}>
        Error: {error}
        <button onClick={fetchData} style={{ marginLeft: 12, color: '#58a6ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        <StatBox label="Total Interactions" value={data.total_interactions.toLocaleString()} />
        <StatBox label="Unique Users" value={data.unique_users.toLocaleString()} />
        <StatBox
          label="Most Replied-To"
          value={data.most_replied_to ? `@${data.most_replied_to.username}` : '--'}
          sub={data.most_replied_to ? `${data.most_replied_to.count} replies` : undefined}
        />
        <StatBox
          label="Top Commenter"
          value={data.most_active_commenter ? `@${data.most_active_commenter.username}` : '--'}
          sub={data.most_active_commenter ? `${data.most_active_commenter.count} comments` : undefined}
        />
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '8px 16px',
        background: '#1c2128',
        border: '1px solid #30363d',
        borderRadius: '8px',
        marginBottom: '12px',
        fontSize: '0.75rem',
        fontFamily: "'SF Mono', monospace",
        color: '#8b949e',
        flexWrap: 'wrap',
      }}>
        <LegendItem color={TYPE_COLORS.reply_to} label="Reply" />
        <LegendItem color={TYPE_COLORS.commented_on} label="Comment" />
        <LegendItem color={TYPE_COLORS.quoted_by} label="Quote" />
        <LegendItem color={TYPE_COLORS.mention} label="Mention" />
      </div>

      {/* Hover tooltip */}
      {hoveredNode && hoveredNode.id !== CENTER_USER && (
        <div style={{
          padding: '8px 14px',
          background: '#1c2128',
          border: '1px solid #30363d',
          borderRadius: '6px',
          marginBottom: '8px',
          fontSize: '0.8rem',
          fontFamily: "'SF Mono', monospace",
          color: '#e6edf3',
        }}>
          <strong>{hoveredNode.label}</strong>
          <span style={{ color: '#6e7681', marginLeft: 12 }}>
            {hoveredNode.totalInteractions} interactions
          </span>
          <span style={{ color: '#6e7681', marginLeft: 12 }}>
            {hoveredNode.reply_to > 0 && `${hoveredNode.reply_to} replies `}
            {hoveredNode.mention > 0 && `${hoveredNode.mention} mentions `}
            {hoveredNode.commented_on > 0 && `${hoveredNode.commented_on} comments `}
            {hoveredNode.quoted_by > 0 && `${hoveredNode.quoted_by} quotes`}
          </span>
          {hoveredNode.lastInteraction && (
            <span style={{ color: '#6e7681', marginLeft: 12 }}>
              last: {new Date(hoveredNode.lastInteraction).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Graph container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '0.75rem', color: '#6e7681', fontFamily: "'SF Mono', monospace" }}>
          {data.users.length} connected users / {data.total_interactions} interactions
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: '4px 12px',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            color: loading ? '#6e7681' : '#e6edf3',
            fontSize: '0.75rem',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: "'SF Mono', monospace",
          }}
        >
          {loading ? 'loading...' : 'refresh'}
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '600px',
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      />

      {/* Top users table */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '0.85rem', color: '#e6edf3', fontFamily: "'SF Mono', monospace", marginBottom: '12px' }}>
          Top Interactions
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: "'SF Mono', monospace" }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d' }}>
              <th style={{ textAlign: 'left', padding: '8px', color: '#6e7681', fontWeight: 600 }}>User</th>
              <th style={{ textAlign: 'right', padding: '8px', color: '#6e7681', fontWeight: 600 }}>Total</th>
              <th style={{ textAlign: 'right', padding: '8px', color: TYPE_COLORS.reply_to, fontWeight: 600 }}>Replies</th>
              <th style={{ textAlign: 'right', padding: '8px', color: TYPE_COLORS.mention, fontWeight: 600 }}>Mentions</th>
              <th style={{ textAlign: 'right', padding: '8px', color: TYPE_COLORS.commented_on, fontWeight: 600 }}>Comments</th>
              <th style={{ textAlign: 'right', padding: '8px', color: TYPE_COLORS.quoted_by, fontWeight: 600 }}>Quotes</th>
              <th style={{ textAlign: 'right', padding: '8px', color: '#6e7681', fontWeight: 600 }}>Last</th>
            </tr>
          </thead>
          <tbody>
            {data.users.slice(0, 25).map((user) => (
              <tr key={user.username} style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '6px 8px', color: '#e6edf3' }}>@{user.username}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: '#e6edf3' }}>{user.total_interactions}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: user.reply_to ? TYPE_COLORS.reply_to : '#30363d' }}>{user.reply_to || '--'}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: user.mention ? TYPE_COLORS.mention : '#30363d' }}>{user.mention || '--'}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: user.commented_on ? TYPE_COLORS.commented_on : '#30363d' }}>{user.commented_on || '--'}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: user.quoted_by ? TYPE_COLORS.quoted_by : '#30363d' }}>{user.quoted_by || '--'}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6e7681' }}>
                  {user.last_interaction ? new Date(user.last_interaction).toLocaleDateString() : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      flex: 1,
      minWidth: '140px',
      padding: '12px 16px',
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.7rem', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e6edf3', fontFamily: "'SF Mono', monospace" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.7rem', color: '#8b949e', marginTop: '2px' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </div>
  );
}
