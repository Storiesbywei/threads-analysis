import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGraphTopics } from "@/hooks/useApi";
import { fetchGraphRelated } from "@/lib/api";
import NudgeCard from "@/components/primitives/NudgeCard";
import { T1000Browser } from "@/components/primitives/T1000Browser";
import type { T1000Item, T1000Row } from "@/components/primitives/T1000Browser";
import type { KGNode, KGRelated } from "@/lib/types";

// ── Helpers ──

const num = (v: number | undefined): string =>
  v != null ? v.toLocaleString() : "\u2014";

const fmt = (v: number | null | undefined, digits = 4): string =>
  v != null ? v.toFixed(digits) : "\u2014";

// ── Section Badge ──

function SectionBadge({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "inline-block",
        background: "transparent",
        color: "#555",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "4px 12px",
        borderRadius: 3,
        marginBottom: 20,
        border: "1.5px solid #D5D0C8",
      }}
    >
      {label}
    </div>
  );
}

// ── Metric Card ──

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f5f5f5",
        padding: "20px 24px",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#888",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#111",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Stat Pill ──

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "#f5f5f5",
        padding: "6px 14px",
        borderRadius: 4,
        fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        fontSize: 12,
      }}
    >
      <span style={{ color: "#888", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#111", fontWeight: 600 }}>{value}</span>
    </span>
  );
}

// ── Main Page ──

export default function CodexPage() {
  const graphTopics = useGraphTopics();
  const nodes: KGNode[] = graphTopics.data?.data ?? [];

  const [selectedTag, setSelectedTag] = useState<string>("");
  const [sort, setSort] = useState<string>("pagerank");
  const [compact, setCompact] = useState(false);

  // Fetch related nodes for the selected tag
  const related = useQuery({
    queryKey: ["graph", "related", selectedTag],
    queryFn: () => fetchGraphRelated(selectedTag),
    enabled: selectedTag.length > 0,
    staleTime: 300_000,
  });

  // Sort nodes
  const sortedNodes = [...nodes].sort((a, b) => {
    if (sort === "pagerank") {
      return (b.size ?? 0) - (a.size ?? 0);
    }
    if (sort === "degree") {
      return (b.connections?.length ?? 0) - (a.connections?.length ?? 0);
    }
    if (sort === "posts") {
      return (b.post_count ?? 0) - (a.post_count ?? 0);
    }
    return a.label.localeCompare(b.label);
  });

  // Auto-select first node if none selected
  const effectiveTag = selectedTag || (sortedNodes[0]?.label ?? "");

  // Build T1000Browser items from sorted nodes
  const items: T1000Item[] = sortedNodes.map((node) => ({
    id: node.label,
    label: node.label,
    count: node.connections?.length ?? 0,
  }));

  // Build rows from related data
  const relatedList: KGRelated[] = related.data?.data ?? [];
  const rows: T1000Row[] = relatedList.map((r, i) => ({
    id: `${r.related_tag}-${i}`,
    text: r.related_tag,
    meta: r.edge_type,
    value: r.weight != null ? r.weight.toFixed(3) : undefined,
  }));

  const handleItemSelect = useCallback((id: string) => {
    setSelectedTag(id);
  }, []);

  // Compute graph stats
  const totalEdges = nodes.reduce((sum, n) => sum + (n.connections?.length ?? 0), 0);
  const avgDegree = nodes.length > 0 ? (totalEdges / nodes.length).toFixed(1) : "\u2014";

  return (
    <div
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        maxWidth: 900,
        margin: "0 auto",
        padding: "0 0 80px",
      }}
    >
      {/* ── Hero ── */}
      <NudgeCard
        number="STATION 04"
        date="KNOWLEDGE GRAPH"
        title="Codex"
        subtitle={
          graphTopics.isLoading
            ? "Loading graph topology..."
            : `${num(nodes.length)} nodes in the knowledge graph / select a topic to explore its connections`
        }
        tags={["graph", "pmi", "co-occurrence"]}
        variant="default"
      />

      {/* ── Content ── */}
      <div style={{ padding: "48px 24px 0" }}>
        {/* Loading */}
        {graphTopics.isLoading && (
          <div style={{ color: "#888", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Loading graph data...
          </div>
        )}

        {graphTopics.isError && (
          <div style={{ color: "#c73b3b", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Failed to load graph data.
          </div>
        )}

        {/* ── Graph Browser ── */}
        {nodes.length > 0 && (
          <div style={{ marginBottom: 56 }}>
            <SectionBadge label="Topic Explorer" />
            <T1000Browser
              items={items}
              activeItemId={effectiveTag}
              onItemSelect={handleItemSelect}
              rows={
                related.isLoading
                  ? [{ id: "loading", text: "Loading related topics..." }]
                  : rows.length > 0
                    ? rows
                    : [{ id: "empty", text: "No related topics found." }]
              }
              headerLabel={effectiveTag}
              headerTag="NODE"
              headerCount={`${relatedList.length} connections`}
              sortOptions={["pagerank", "degree", "posts", "alpha"]}
              activeSort={sort}
              onSortChange={setSort}
              compact={compact}
              onCompactToggle={() => setCompact((c) => !c)}
              height={420}
            />
          </div>
        )}

        {/* ── Selected Node Detail ── */}
        {effectiveTag && nodes.length > 0 && (
          <div style={{ marginBottom: 56 }}>
            <SectionBadge label="Node Detail" />
            {(() => {
              const node = nodes.find((n) => n.label === effectiveTag);
              if (!node) return null;
              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 12,
                  }}
                >
                  <MetricCard label="Label" value={node.label} />
                  <MetricCard label="Type" value={node.node_type} />
                  <MetricCard label="Post Count" value={num(node.post_count ?? undefined)} />
                  <MetricCard label="Size (PageRank)" value={fmt(node.size)} />
                  <MetricCard label="Connections" value={num(node.connections?.length ?? 0)} />
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Graph Stats ── */}
        {nodes.length > 0 && (
          <div>
            <SectionBadge label="Graph Metrics" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <StatPill label="Total nodes" value={num(nodes.length)} />
              <StatPill label="Total edges" value={num(totalEdges)} />
              <StatPill label="Avg degree" value={avgDegree} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
