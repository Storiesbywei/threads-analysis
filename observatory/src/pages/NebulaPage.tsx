import { useClusters } from "@/hooks/useApi";
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

// ── Cluster Card ──

function ClusterCard({ cluster, maxSize }: { cluster: ClusterInfo; maxSize: number }) {
  const barWidth = maxSize > 0 ? (cluster.size / maxSize) * 100 : 0;
  const keywords = cluster.description
    ? cluster.description.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 5)
    : [];

  return (
    <div
      style={{
        background: "#f5f5f5",
        borderRadius: 6,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#111",
            lineHeight: 1.3,
          }}
        >
          {cluster.name || `Cluster ${cluster.cluster_id}`}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
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
      <div
        style={{
          height: 4,
          background: "#e0e0e0",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
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
                background: "#e8e8e8",
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

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: 10,
          color: "#888",
          fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        }}
      >
        <span>ID {cluster.cluster_id}</span>
        {cluster.dominant_energy && <span>energy: {cluster.dominant_energy}</span>}
        {cluster.dominant_intent && <span>intent: {cluster.dominant_intent}</span>}
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

export default function NebulaPage() {
  const clusters = useClusters();
  const data = clusters.data;
  const clusterList: ClusterInfo[] = data?.data ?? [];
  const model = data?.model ?? "all-minilm";
  const totalPoints = clusterList.reduce((sum, c) => sum + c.size, 0);
  const maxSize = clusterList.reduce((max, c) => Math.max(max, c.size), 0);

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
        number="STATION 03"
        date="UMAP SCATTER"
        title="Nebula"
        subtitle={
          clusters.isLoading
            ? "Loading cluster data..."
            : `${num(clusterList.length)} clusters across ${num(totalPoints)} embedded points / model: ${model}`
        }
        tags={["clusters", "umap", "embeddings"]}
        variant="dark"
      />

      {/* ── Content ── */}
      <div style={{ padding: "48px 24px 0" }}>
        {/* Loading state */}
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

        {/* ── Cluster Grid ── */}
        {clusterList.length > 0 && (
          <div style={{ marginBottom: 56 }}>
            <SectionBadge label="Cluster Map" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {clusterList
                .slice()
                .sort((a, b) => b.size - a.size)
                .map((cluster) => (
                  <ClusterCard key={cluster.cluster_id} cluster={cluster} maxSize={maxSize} />
                ))}
            </div>
          </div>
        )}

        {/* ── Summary Stats ── */}
        {clusterList.length > 0 && (
          <div>
            <SectionBadge label="Summary" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <StatPill label="Total points" value={num(totalPoints)} />
              <StatPill label="Clusters" value={num(clusterList.length)} />
              <StatPill label="Model" value={model} />
              <StatPill label="Largest" value={num(maxSize)} />
              <StatPill
                label="Avg size"
                value={clusterList.length > 0 ? Math.round(totalPoints / clusterList.length).toLocaleString() : "\u2014"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
