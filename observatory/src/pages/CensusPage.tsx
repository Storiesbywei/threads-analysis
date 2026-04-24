import { useState, useMemo } from "react";
import { useClusters, useClusterSummary } from "@/hooks/useApi";
import NudgeCard from "@/components/primitives/NudgeCard";
import type { ClusterInfo } from "@/lib/types";

// ── Helpers ──

const num = (v: number | undefined): string =>
  v != null ? v.toLocaleString() : "\u2014";

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

// ── Sort Control ──

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "6px 14px",
        borderRadius: 3,
        border: active ? "1.5px solid #FF5500" : "1.5px solid #D5D0C8",
        background: active ? "#FF5500" : "transparent",
        color: active ? "#fff" : "#555",
        cursor: "pointer",
        fontFamily: "'Space Grotesk', sans-serif",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ── Filter Input ──

function FilterInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      placeholder="Filter clusters..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 12,
        fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        padding: "6px 14px",
        borderRadius: 3,
        border: "1.5px solid #D5D0C8",
        background: "#fff",
        color: "#111",
        outline: "none",
        width: 200,
        maxWidth: "100%",
      }}
    />
  );
}

// ── Cluster Grid Card ──

function CensusCard({ cluster, maxSize }: { cluster: ClusterInfo; maxSize: number }) {
  const barWidth = maxSize > 0 ? (cluster.size / maxSize) * 100 : 0;
  const keywords = cluster.description
    ? cluster.description.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 6)
    : [];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 6,
        padding: "20px 24px",
        border: "1px solid #e8e4dc",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.3, flex: 1 }}>
          {cluster.name || `Cluster ${cluster.cluster_id}`}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#FF5500",
            fontFamily: "'Share Tech Mono', 'Courier New', monospace",
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          {cluster.size.toLocaleString()}
        </div>
      </div>

      {/* Size bar */}
      <div style={{ height: 3, background: "#f0ede5", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            width: `${barWidth}%`,
            height: "100%",
            background: "#FF5500",
            borderRadius: 2,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Keywords */}
      {keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {keywords.map((kw) => (
            <span
              key={kw}
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "#666",
                background: "#f5f2ec",
                padding: "2px 8px",
                borderRadius: 2,
                fontFamily: "'Share Tech Mono', 'Courier New', monospace",
              }}
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Meta */}
      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: 10,
          color: "#999",
          fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        }}
      >
        <span>ID {cluster.cluster_id}</span>
        {cluster.dominant_energy && <span>{cluster.dominant_energy}</span>}
        {cluster.avg_sentiment != null && (
          <span>sentiment: {cluster.avg_sentiment.toFixed(2)}</span>
        )}
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

export default function CensusPage() {
  const clusters = useClusters();
  const summary = useClusterSummary();

  const clusterList: ClusterInfo[] = clusters.data?.data ?? [];
  const summaryData = summary.data;

  const [sortBy, setSortBy] = useState<"size" | "label">("size");
  const [filter, setFilter] = useState("");

  // Filter + sort
  const processed = useMemo(() => {
    let result = [...clusterList];

    // Filter
    if (filter.length > 0) {
      const q = filter.toLowerCase();
      result = result.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          String(c.cluster_id).includes(q),
      );
    }

    // Sort
    if (sortBy === "size") {
      result.sort((a, b) => b.size - a.size);
    } else {
      result.sort((a, b) =>
        (a.name ?? `Cluster ${a.cluster_id}`).localeCompare(b.name ?? `Cluster ${b.cluster_id}`),
      );
    }

    return result;
  }, [clusterList, sortBy, filter]);

  const maxSize = clusterList.reduce((max, c) => Math.max(max, c.size), 0);
  const totalPosts = summaryData?.total_posts ?? clusterList.reduce((sum, c) => sum + c.size, 0);
  const totalClusters = summaryData?.total_clusters ?? clusterList.length;

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
        number="STATION 05"
        date="CLUSTER GRID"
        title="Census"
        subtitle={
          clusters.isLoading
            ? "Loading cluster census..."
            : `${num(totalClusters)} clusters spanning ${num(totalPosts)} posts`
        }
        tags={["census", "clusters", "taxonomy"]}
        variant="accent"
      />

      {/* ── Content ── */}
      <div style={{ padding: "48px 24px 0" }}>
        {/* Loading */}
        {clusters.isLoading && (
          <div style={{ color: "#888", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Loading cluster data...
          </div>
        )}

        {clusters.isError && (
          <div style={{ color: "#c73b3b", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Failed to load cluster data.
          </div>
        )}

        {/* ── Controls ── */}
        {clusterList.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <SortButton label="By Size" active={sortBy === "size"} onClick={() => setSortBy("size")} />
            <SortButton label="By Label" active={sortBy === "label"} onClick={() => setSortBy("label")} />
            <FilterInput value={filter} onChange={setFilter} />
            <div
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "#888",
                fontFamily: "'Share Tech Mono', 'Courier New', monospace",
              }}
            >
              {processed.length} / {clusterList.length} shown
            </div>
          </div>
        )}

        {/* ── Cluster Grid ── */}
        {processed.length > 0 && (
          <div style={{ marginBottom: 56 }}>
            <SectionBadge label="All Clusters" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {processed.map((cluster) => (
                <CensusCard key={cluster.cluster_id} cluster={cluster} maxSize={maxSize} />
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {clusterList.length > 0 && processed.length === 0 && (
          <div style={{ color: "#888", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            No clusters match "{filter}"
          </div>
        )}

        {/* ── Summary Stats ── */}
        {clusterList.length > 0 && (
          <div>
            <SectionBadge label="Census Summary" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
              <StatPill label="Total clusters" value={num(totalClusters)} />
              <StatPill label="Total posts" value={num(totalPosts)} />
              <StatPill label="Model" value={summaryData?.model ?? clusters.data?.model ?? "\u2014"} />
              <StatPill label="Largest" value={num(maxSize)} />
              <StatPill
                label="Avg size"
                value={
                  clusterList.length > 0
                    ? Math.round(totalPosts / clusterList.length).toLocaleString()
                    : "\u2014"
                }
              />
            </div>

            {/* Top 5 from summary */}
            {summaryData?.top_5 && summaryData.top_5.length > 0 && (
              <div>
                <SectionBadge label="Top 5 Clusters" />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 12,
                  }}
                >
                  {summaryData.top_5.map((top, i) => (
                    <div
                      key={top.name}
                      style={{
                        background: "#f5f5f5",
                        borderRadius: 6,
                        padding: "16px 20px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#FF5500",
                          letterSpacing: "0.08em",
                          marginBottom: 6,
                          fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                        }}
                      >
                        #{i + 1}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 4 }}>
                        {top.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#666",
                          fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                        }}
                      >
                        {top.size.toLocaleString()} posts
                      </div>
                      {top.energy && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "#888",
                            fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                            marginTop: 2,
                          }}
                        >
                          {top.energy}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
