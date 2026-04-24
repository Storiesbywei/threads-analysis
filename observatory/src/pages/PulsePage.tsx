import NudgeCard from '@/components/primitives/NudgeCard';
import { useMood, useDrift, useVibe } from '@/hooks/useApi';
import type { DriftItem, VibeItem } from '@/lib/types';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatSentiment(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

// ── Sentiment Dashboard (NudgeCard right panel) ──

function SentimentPanel() {
  const { data: mood, isLoading } = useMood();

  const sentiment = mood?.data?.sentiment ?? 0;
  const moodLabel = mood?.data?.mood ?? 'neutral';
  const breakdown = mood?.data?.breakdown ?? { high: 0, mid: 0, low: 0 };
  const total = breakdown.high + breakdown.mid + breakdown.low || 1;

  const highPct = Math.round((breakdown.high / total) * 100);
  const midPct = Math.round((breakdown.mid / total) * 100);
  const lowPct = 100 - highPct - midPct;

  const sentimentColor = sentiment > 0 ? '#2d6b5a' : sentiment < 0 ? '#C02820' : '#555';

  return (
    <div style={{ padding: '36px 32px', width: '100%' }}>
      {/* Big mood number */}
      <div
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 'clamp(36px, 10vw, 64px)',
          fontWeight: 700,
          color: isLoading ? '#ccc' : sentimentColor,
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {isLoading ? '\u2014' : formatSentiment(sentiment)}
      </div>

      {/* Mood label */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: isLoading ? '#ccc' : sentimentColor,
          marginBottom: 32,
        }}
      >
        {isLoading ? '' : moodLabel}
      </div>

      {/* Energy bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: '#e5e5e3',
          marginBottom: 8,
        }}
      >
        {!isLoading && (
          <>
            <div style={{ width: `${highPct}%`, backgroundColor: '#FF5500' }} />
            <div style={{ width: `${midPct}%`, backgroundColor: '#8A8A87' }} />
            <div style={{ width: `${lowPct}%`, backgroundColor: '#C5C3BE' }} />
          </>
        )}
      </div>

      {/* Energy labels */}
      <div style={{ display: 'flex', gap: 20 }}>
        {([
          ['HIGH', highPct, '#FF5500'],
          ['MID', midPct, '#8A8A87'],
          ['LOW', lowPct, '#C5C3BE'],
        ] as const).map(([label, pct, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: '#555',
                textTransform: 'uppercase',
              }}
            >
              {label} {isLoading ? '--' : `${pct}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Topic Drift Section ──

function TopicDriftSection() {
  const { data: drift, isLoading } = useDrift();

  const items: DriftItem[] = drift?.data
    ? [...drift.data].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10)
    : [];

  return (
    <div style={{ padding: '36px 44px' }}>
      {/* Section badge */}
      <span
        style={{
          display: 'inline-block',
          background: 'transparent',
          color: '#555',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          marginBottom: 20,
          border: '1.5px solid #D5D0C8',
          borderRadius: 3,
        }}
      >
        TOPIC DRIFT
      </span>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => {
            const isPositive = item.delta >= 0;
            return (
              <div
                key={item.tag}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: '#111' }}>
                  {item.tag}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: isPositive ? '#2d6b5a' : '#C02820',
                    minWidth: 48,
                    textAlign: 'right',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      ...(isPositive
                        ? { borderBottom: '6px solid #2d6b5a', marginRight: 4 }
                        : { borderTop: '6px solid #C02820', marginRight: 4 }),
                      verticalAlign: 'middle',
                    }}
                  />
                  {Math.abs(item.delta)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#888',
                    minWidth: 80,
                    textAlign: 'right',
                  }}
                >
                  {item.this_month} / {item.last_month}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Vibe Breakdown Section ──

function VibeSection() {
  const { data: vibe, isLoading } = useVibe();

  const items: VibeItem[] = vibe?.data ?? [];

  if (isLoading || items.length === 0) return null;

  const maxPct = Math.max(...items.map((v) => v.percentage));

  return (
    <div style={{ padding: '36px 44px' }}>
      <span
        style={{
          display: 'inline-block',
          background: 'transparent',
          color: '#555',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          marginBottom: 20,
          border: '1.5px solid #D5D0C8',
          borderRadius: 3,
        }}
      >
        TODAY&apos;S VIBE
      </span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((item) => {
          const intensity = maxPct > 0 ? item.percentage / maxPct : 0;
          const alpha = 0.1 + intensity * 0.5;
          return (
            <span
              key={item.vibe}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                backgroundColor: `rgba(17, 17, 17, ${alpha})`,
                color: intensity > 0.6 ? '#fff' : '#111',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                borderRadius: 20,
              }}
            >
              {item.vibe} {item.percentage}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Highlight Box ──

function HighlightBox() {
  const { data: mood, isLoading } = useMood();

  const brief = mood?.data?.brief;
  if (isLoading || !brief) return null;

  return (
    <div
      style={{
        margin: '0 44px 36px',
        padding: '28px 32px',
        backgroundColor: '#FF5500',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#fff',
          marginBottom: 10,
        }}
      >
        Current State
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.92)',
        }}
      >
        {brief}
      </div>
    </div>
  );
}

// ── Page ──

export default function PulsePage() {
  const { data: mood } = useMood();
  const subtitle = mood?.data?.brief ?? 'Analyzing sentiment and energy patterns...';

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <NudgeCard
        number="07"
        date={formatDate()}
        title="Pulse"
        subtitle={subtitle}
        tags={['SENTIMENT', 'ENERGY', 'MOOD']}
        variant="default"
      >
        <SentimentPanel />
      </NudgeCard>

      <TopicDriftSection />
      <VibeSection />
      <HighlightBox />
    </div>
  );
}
