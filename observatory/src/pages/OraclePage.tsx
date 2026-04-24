import NudgeCard from '@/components/primitives/NudgeCard';
import { useHaikuLatest, useHaikuAll } from '@/hooks/useApi';
import type { HaikuListItem } from '@/lib/types';

// ── Helpers ──

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '\u2014';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Section Badge ──

function SectionBadge({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'inline-block',
        background: 'transparent',
        color: '#555',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '4px 12px',
        borderRadius: 3,
        marginBottom: 20,
        border: '1.5px solid #D5D0C8',
      }}
    >
      {label}
    </div>
  );
}

// ── Featured Haiku Display ──

function FeaturedHaiku() {
  const { data: latest, isLoading } = useHaikuLatest();
  const haiku = latest?.data;

  if (isLoading) {
    return (
      <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif", padding: '36px 44px' }}>
        loading...
      </div>
    );
  }

  if (!haiku) return null;

  const lines = haiku.haiku.split('\n').filter((l) => l.trim());

  return (
    <div style={{ padding: '48px 44px', textAlign: 'center' }}>
      <div
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '48px 32px',
          background: '#fafaf8',
          borderRadius: 8,
          border: '1px solid #e8e4dc',
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 2,
              color: '#111',
              fontFamily: "'Cinzel', serif",
              letterSpacing: '0.02em',
            }}
          >
            {line}
          </div>
        ))}

        <div
          style={{
            marginTop: 32,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 16,
            fontSize: 12,
            color: '#888',
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          <span>{formatTimestamp(haiku.generated_at)}</span>
          <span style={{ color: '#D5D0C8' }}>|</span>
          <span>{haiku.model}</span>
          <span style={{ color: '#D5D0C8' }}>|</span>
          <span>{haiku.sources.length} source{haiku.sources.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ── Haiku Preview (inside NudgeCard) ──

function HaikuPreview() {
  const { data: latest } = useHaikuLatest();
  const haiku = latest?.data;

  if (!haiku) return null;

  const lines = haiku.haiku.split('\n').filter((l) => l.trim());

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 32px',
        width: '100%',
        fontFamily: "'Cinzel', serif",
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontSize: 16,
            lineHeight: 2.2,
            color: '#3d1500',
            letterSpacing: '0.02em',
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

// ── Haiku Archive ──

function HaikuArchive() {
  const { data: all, isLoading } = useHaikuAll();

  const items: HaikuListItem[] = all?.data ?? [];

  if (isLoading) {
    return (
      <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        No haiku in the archive yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxHeight: 480,
        overflowY: 'auto',
      }}
    >
      {items.map((item) => {
        const lines = item.haiku.split('\n').filter((l) => l.trim());
        return (
          <div
            key={item.uuid}
            style={{
              background: '#fafaf8',
              border: '1px solid #e8e4dc',
              borderRadius: 6,
              padding: '20px 24px',
            }}
          >
            <div style={{ marginBottom: 12 }}>
              {lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 14,
                    lineHeight: 1.8,
                    color: '#111',
                    fontFamily: "'Cinzel', serif",
                    letterSpacing: '0.01em',
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 11,
                color: '#888',
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              <span>{formatTimestamp(item.generated_at)}</span>
              <span style={{ color: '#D5D0C8' }}>|</span>
              <span>{item.model}</span>
              <span style={{ color: '#D5D0C8' }}>|</span>
              <span>{item.source_count} source{item.source_count !== 1 ? 's' : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──

export default function OraclePage() {
  return (
    <div
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        maxWidth: 900,
        margin: '0 auto',
        padding: '0 0 80px',
      }}
    >
      {/* ── Hero ── */}
      <NudgeCard
        number="11"
        date={formatDate()}
        title="Oracle"
        subtitle="AI-generated haiku distilled from recent posts"
        tags={['HAIKU', 'GENERATIVE', 'POETICS']}
        variant="accent"
      >
        <HaikuPreview />
      </NudgeCard>

      {/* ── Featured Haiku ── */}
      <FeaturedHaiku />

      {/* ── Archive ── */}
      <div style={{ padding: '0 44px 36px' }}>
        <SectionBadge label="Archive" />
        <HaikuArchive />
      </div>
    </div>
  );
}
