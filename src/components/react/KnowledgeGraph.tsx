import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ForceGraph2D from 'force-graph';
import GraphControls, { type GraphFilters } from './GraphControls';

interface GraphNode {
  id: string;
  label: string;
  type: 'tag' | 'sub_tag' | 'concept' | 'bridge';
  post_count: number;
  size: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'co_occurrence' | 'temporal' | 'hierarchy' | 'concept_link' | 'bridge_link';
  weight: number;
  count: number;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const ALL_EDGE_TYPES = new Set(['co_occurrence', 'temporal', 'hierarchy', 'concept_link', 'bridge_link']);
const ALL_NODE_TYPES = new Set(['tag', 'sub_tag', 'concept', 'bridge']);

export default function KnowledgeGraph({ nodes: initialNodes, edges: initialEdges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphInstanceRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<GraphFilters>({
    edgeTypes: new Set(ALL_EDGE_TYPES),
    nodeTypes: new Set(ALL_NODE_TYPES),
    searchQuery: '',
    minWeight: 0,
  });

  // Compute filtered graph data
  const filteredData = useMemo(() => {
    // Filter nodes by type
    const visibleNodes = nodes.filter((n) => filters.nodeTypes.has(n.type));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    // Filter edges by type, weight, and ensure both endpoints visible
    const visibleEdges = edges.filter(
      (e) =>
        filters.edgeTypes.has(e.type) &&
        e.weight >= filters.minWeight &&
        visibleNodeIds.has(typeof e.source === 'object' ? (e.source as any).id : e.source) &&
        visibleNodeIds.has(typeof e.target === 'object' ? (e.target as any).id : e.target)
    );

    // Determine highlighted nodes from search
    const searchLower = filters.searchQuery.toLowerCase().trim();
    const highlightedIds = searchLower
      ? new Set(
          visibleNodes
            .filter((n) => n.label.toLowerCase().includes(searchLower))
            .map((n) => n.id)
        )
      : null;

    // Connected nodes for selection highlight
    const connectedIds = new Set<string>();
    if (selectedNode) {
      connectedIds.add(selectedNode);
      visibleEdges.forEach((e) => {
        const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
        const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
        if (src === selectedNode) connectedIds.add(tgt);
        if (tgt === selectedNode) connectedIds.add(src);
      });
    }

    return {
      nodes: visibleNodes.map((n) => ({ ...n })),
      links: visibleEdges.map((e) => ({
        source: typeof e.source === 'object' ? (e.source as any).id : e.source,
        target: typeof e.target === 'object' ? (e.target as any).id : e.target,
        type: e.type,
        weight: e.weight,
        count: e.count,
      })),
      highlightedIds,
      connectedIds,
    };
  }, [nodes, edges, filters, selectedNode]);

  // Refresh from API
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/graph');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      console.error('Graph refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous
    containerRef.current.innerHTML = '';

    const width = containerRef.current.clientWidth || 800;

    const graph = new ForceGraph2D(containerRef.current)
      .graphData({
        nodes: filteredData.nodes,
        links: filteredData.links,
      })
      .backgroundColor('#0d1117')
      .width(width)
      .height(600)
      .nodeColor((node: any) => {
        const id = node.id;
        // Search highlighting
        if (filteredData.highlightedIds && !filteredData.highlightedIds.has(id)) {
          return 'rgba(110, 118, 129, 0.15)';
        }
        // Selection highlighting
        if (selectedNode && !filteredData.connectedIds.has(id)) {
          return 'rgba(110, 118, 129, 0.15)';
        }
        return node.color || '#6e7681';
      })
      .nodeVal((node: any) => Math.max(1, Math.log2(node.size || 1) * 1.5))
      .nodeLabel((node: any) => {
        const count = node.post_count != null ? node.post_count : '';
        return `${node.label} (${node.type}, ${count} posts)`;
      })
      .linkColor((link: any) => {
        const alpha = Math.max(0.05, Math.min(0.4, link.weight * 0.5));
        return `rgba(88, 166, 255, ${alpha})`;
      })
      .linkWidth((link: any) => Math.max(0.5, link.weight * 3))
      .onNodeClick((node: any) => {
        setSelectedNode((prev: string | null) => (prev === node.id ? null : node.id));
      })
      .cooldownTicks(100)
      .d3AlphaDecay(0.03)
      .d3VelocityDecay(0.3);

    graphInstanceRef.current = graph as any;

    // Handle resize
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
        // force-graph destructor may throw if already cleaned up
      }
    };
  }, [filteredData, selectedNode]);

  return (
    <div>
      <GraphControls filters={filters} onChange={setFilters} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontSize: '0.75rem', color: '#6e7681', fontFamily: "'SF Mono', monospace" }}>
          {filteredData.nodes.length} nodes / {filteredData.links.length} edges
          {selectedNode && (
            <span style={{ marginLeft: '12px', color: '#58a6ff' }}>
              selected: {selectedNode}
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                  marginLeft: '8px',
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                }}
              >
                clear
              </button>
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
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
    </div>
  );
}
