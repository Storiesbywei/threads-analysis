import NudgeCard from '@/components/primitives/NudgeCard';
import { useHourly, useDaily, useVelocity, useStreak } from '@/hooks/useApi';
import type { HourlyStat, DailyStat } from '@/lib/types';

// ── Helpers ──

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const num = (v: number | undefined): string =>
  v != null ? v.toLocaleString() : '\u2014';

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

// ── Metric Card ──

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#f5f5f5',
        padding: '20px 24px',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#888',
          marginBottom: 8,
          fontFamily: "'Share Tech Mono', monospace",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: '#111',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: "'Share Tech Mono', monospace",
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#f5f5f5',
        padding: '6px 14px',
        borderRadius: 4,
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 12,
      }}
    >
      <span style={{ color: '#888', fontWeight: 500 }}>{label}</span>
      <span style={{ color: '#111', fontWeight: 600 }}>{value}</span>
    </span>
  );
}

// ── Hourly Bar Chart ──

function HourlyBarChart() {
  const { data: hourly, isLoading } = useHourly();

  const items: HourlyStat[] = hourly?.data ?? [];
  const max = Math.max(...items.map((h) => h.count), 1);
  const peakHour = items.reduce<HourlyStat | null>(
    (best, cur) => (!best || cur.count > best.count ? cur : best),
    null,
  );

  if (isLoading) {
    return (
      <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item) => {
        const isPeak = peakHour?.hour === item.hour;
        return (
          <div
            key={item.hour}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            <span
              style={{
                width: 36,
                fontSize: 12,
                fontWeight: 500,
                color: isPeak ? '#FF5500' : '#555',
                textAlign: 'right',
                flexShrink: 0,
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {String(item.hour).padStart(2, '0')}:00
            </span>
            <div
              style={{
                flex: 1,
                height: 16,
                background: '#f0f0f0',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(item.count / max) * 100}%`,
                  height: '100%',
                  background: isPeak ? '#FF5500' : '#111',
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <span
              style={{
                width: 40,
                fontSize: 12,
                fontWeight: 600,
                color: isPeak ? '#FF5500' : '#333',
                textAlign: 'right',
                flexShrink: 0,
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {item.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Daily Trend (last 14 days) ──

function DailyTrend() {
  const { data: daily, isLoading } = useDaily();

  const items: DailyStat[] = daily?.data ? [...daily.data].slice(-14) : [];
  const max = Math.max(...items.map((d) => d.count), 1);

  if (isLoading) {
    return (
      <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item) => (
        <div
          key={item.day}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <span
            style={{
              width: 80,
              fontSize: 12,
              fontWeight: 500,
              color: '#555',
              flexShrink: 0,
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            {item.day}
          </span>
          <div
            style={{
              flex: 1,
              height: 16,
              background: '#f0f0f0',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(item.count / max) * 100}%`,
                height: '100%',
                background: '#111',
                borderRadius: 3,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span
            style={{
              width: 32,
              fontSize: 12,
              fontWeight: 600,
              color: '#333',
              textAlign: 'right',
              flexShrink: 0,
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Velocity Panel (shown inside NudgeCard right side) ──

function VelocityPanel() {
  const { data: velocity } = useVelocity();
  const v = velocity?.data;

  const metrics = [
    { label: '7 days', value: v?.last_7_days },
    { label: '30 days', value: v?.last_30_days },
    { label: '90 days', value: v?.last_90_days },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '24px 32px',
        fontFamily: "'Space Grotesk', sans-serif",
        width: '100%',
      }}
    >
      {metrics.map((m) => (
        <div key={m.label}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#888',
              marginBottom: 4,
            }}
          >
            {m.label}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: '#111',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            {num(m.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──

export default function RhythmPage() {
  const { data: velocity } = useVelocity();
  const { data: streak } = useStreak();

  const streakDays = streak?.data?.streak_days;
  const lastPost = streak?.data?.last_post_date;
  const v = velocity?.data;

  const subtitle = streakDays != null && v
    ? `${streakDays}-day streak / ${num(v.last_7_days)} posts this week`
    : 'Analyzing posting cadence and temporal patterns';

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
        number="10"
        date={formatDate()}
        title="Rhythm"
        subtitle={subtitle}
        tags={['TEMPORAL', 'CADENCE', 'VELOCITY']}
        variant="default"
      >
        <VelocityPanel />
      </NudgeCard>

      {/* ── Velocity Cards ── */}
      <div style={{ padding: '36px 44px' }}>
        <SectionBadge label="Velocity" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <MetricCard label="Last 7 days" value={num(v?.last_7_days)} />
          <MetricCard label="Last 30 days" value={num(v?.last_30_days)} />
          <MetricCard label="Last 90 days" value={num(v?.last_90_days)} />
        </div>
      </div>

      {/* ── Hourly Pattern ── */}
      <div style={{ padding: '0 44px 36px' }}>
        <SectionBadge label="Hourly Distribution" />
        <HourlyBarChart />
      </div>

      {/* ── Daily Trend ── */}
      <div style={{ padding: '0 44px 36px' }}>
        <SectionBadge label="Last 14 Days" />
        <DailyTrend />
      </div>

      {/* ── Stat Pills ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          padding: '0 44px',
        }}
      >
        <StatPill label="Streak" value={streakDays != null ? `${streakDays} days` : '\u2014'} />
        <StatPill label="Last post" value={lastPost ?? '\u2014'} />
      </div>
    </div>
  );
}
