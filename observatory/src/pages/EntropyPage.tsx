import { useCorpus } from "@/hooks/useApi";
import { TAG_COLORS } from "@/lib/types";
import type { CorpusSnapshot } from "@/lib/types";

// ── Helpers ──

const fmt = (v: number | undefined, digits = 3): string =>
  v != null ? v.toFixed(digits) : "\u2014";

const pct = (v: number | undefined, digits = 1): string =>
  v != null ? `${(v * 100).toFixed(digits)}%` : "\u2014";

const num = (v: number | undefined): string =>
  v != null ? v.toLocaleString() : "\u2014";

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
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Tag Bar Chart ──

function TagDistribution({
  distribution,
}: {
  distribution: Record<string, number> | undefined;
}) {
  if (!distribution) {
    return (
      <div style={{ color: "#888", fontSize: 13, padding: "12px 0" }}>
        Loading tag distribution...
      </div>
    );
  }

  const sorted = Object.entries(distribution).sort(([, a], [, b]) => b - a);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map(([tag, count]) => (
        <div
          key={tag}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 110,
              fontSize: 12,
              fontWeight: 500,
              color: "#555",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {tag}
          </div>
          <div
            style={{
              flex: 1,
              height: 18,
              background: "#f0f0f0",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(count / max) * 100}%`,
                height: "100%",
                background: TAG_COLORS[tag] ?? "#888",
                borderRadius: 3,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              width: 50,
              fontSize: 12,
              fontWeight: 600,
              color: "#333",
              fontVariantNumeric: "tabular-nums",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {count.toLocaleString()}
          </div>
        </div>
      ))}
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
        fontFamily: "'Space Mono', 'SF Mono', monospace",
        fontSize: 12,
      }}
    >
      <span style={{ color: "#888", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#111", fontWeight: 600 }}>{value}</span>
    </span>
  );
}

// ── Section Badge ──

function SectionBadge({
  label,
  color = "#f5d000",
}: {
  label: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "inline-block",
        background: color,
        color: "#111",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "5px 12px",
        borderRadius: 3,
        marginBottom: 20,
      }}
    >
      {label}
    </div>
  );
}

// ── Main Page ──

export default function EntropyPage() {
  const corpus = useCorpus();
  const d: CorpusSnapshot | undefined = corpus.data?.data;

  return (
    <div
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        maxWidth: 900,
        margin: "0 auto",
        padding: "60px 24px 80px",
      }}
    >
      {/* ── Section 1: Header ── */}
      <div style={{ marginBottom: 48 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#888",
            marginBottom: 16,
          }}
        >
          STATION 02 / INFORMATION THEORY
        </div>
        <h1
          style={{
            fontSize: 52,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: "#111",
            margin: 0,
            marginBottom: 16,
          }}
        >
          information entropy
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "#555",
            lineHeight: 1.7,
            margin: 0,
            maxWidth: 640,
          }}
        >
          Shannon entropy, Zipf distributions, and surprise scores across{" "}
          {num(d?.total_posts)} posts and {num(d?.vocabulary_size)} unique words.
        </p>
      </div>

      {/* ── Section 2: Metrics Grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 56,
        }}
      >
        <MetricCard label="Char Entropy" value={`${fmt(d?.char_entropy)} bits`} />
        <MetricCard label="Word Entropy" value={`${fmt(d?.word_entropy)} bits`} />
        <MetricCard
          label="Bigram Entropy"
          value={`${fmt(d?.bigram_entropy)} bits`}
        />
        <MetricCard label="Zipf Exponent" value={fmt(d?.zipf_exponent)} />
        <MetricCard label="Heaps Exponent" value={fmt(d?.heaps_exponent)} />
        <MetricCard label="Tag Entropy" value={`${fmt(d?.tag_entropy)} bits`} />
      </div>

      {/* ── Section 3: Tag Distribution ── */}
      <div style={{ marginBottom: 56 }}>
        <SectionBadge label="Tag Distribution" />
        <TagDistribution distribution={d?.tag_distribution} />
      </div>

      {/* ── Section 4: Highlight Box ── */}
      <div
        style={{
          background: "#FF5500",
          borderRadius: 8,
          padding: "32px 36px",
          marginBottom: 56,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#3d1500",
            marginBottom: 14,
          }}
        >
          The Surprise Distribution
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.75,
            color: "#3d1500",
          }}
        >
          With a Zipf exponent of {fmt(d?.zipf_exponent)}, the corpus follows a
          power law where a small number of words account for the majority of
          usage. The conditional entropy of {fmt(d?.conditional_entropy)} bits per
          word means each word carries roughly {fmt(d?.conditional_entropy)} bits
          of new information given the previous word. A burst rate of{" "}
          {pct(d?.burst_rate)} indicates how often posting patterns deviate from
          the baseline rhythm.
        </div>
      </div>

      {/* ── Section 5: Stat Pills ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <StatPill label="Total posts" value={num(d?.total_posts)} />
        <StatPill label="Total words" value={num(d?.total_words)} />
        <StatPill label="Vocabulary" value={num(d?.vocabulary_size)} />
        <StatPill
          label="Topic stay rate"
          value={pct(d?.topic_stay_rate)}
        />
        <StatPill label="Burst rate" value={pct(d?.burst_rate)} />
      </div>
    </div>
  );
}
