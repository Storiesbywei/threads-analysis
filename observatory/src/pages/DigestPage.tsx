import NudgeCard from '@/components/primitives/NudgeCard';
import { useDigestToday, useDigestWeek, useDigestBrief, useDrift, useBridges } from '@/hooks/useApi';
import { TAG_COLORS } from '@/lib/types';
import type { DriftItem, Post } from '@/lib/types';

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

function truncate(text: string | null, max = 120): string {
  if (!text) return '\u2014';
  return text.length > max ? text.slice(0, max) + '...' : text;
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

// ── Tag Pill ──

function TagPill({ tag, count }: { tag: string; count?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: TAG_COLORS[tag] ?? '#888',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        padding: '5px 12px',
        borderRadius: 3,
        textTransform: 'uppercase',
        fontFamily: "'Share Tech Mono', monospace",
      }}
    >
      {tag}
      {count != null && (
        <span style={{ opacity: 0.7, fontWeight: 500 }}>{count}</span>
      )}
    </span>
  );
}

// ── Digest Brief Panel (inside NudgeCard) ──

function BriefPanel() {
  const { data: brief } = useDigestBrief();
  const text = brief?.data?.brief;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 32px',
        width: '100%',
      }}
    >
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.7,
          color: '#aaa',
          fontFamily: "'Space Grotesk', sans-serif",
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        {text ?? 'Compiling digest...'}
      </div>
    </div>
  );
}

// ── Today Section ──

function TodaySection() {
  const { data: today, isLoading } = useDigestToday();
  const d = today?.data;

  if (isLoading) {
    return (
      <div style={{ padding: '36px 44px', fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  if (!d) return null;

  return (
    <div style={{ padding: '36px 44px' }}>
      <SectionBadge label="Today" />

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          { label: 'Total', value: d.total_posts },
          { label: 'Original', value: d.originals },
          { label: 'Replies', value: d.replies },
          { label: 'Quotes', value: d.quotes },
          { label: 'Reposts', value: d.reposts },
        ].map((s) => (
          <div key={s.label} style={{ background: '#f5f5f5', padding: '14px 16px', borderRadius: 6 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#888',
                marginBottom: 4,
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#111',
                fontVariantNumeric: 'tabular-nums',
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {num(s.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Top tags */}
      {d.top_tags && d.top_tags.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#888',
              marginBottom: 10,
            }}
          >
            Top Tags
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {d.top_tags.map((t) => (
              <TagPill key={t.tag} tag={t.tag} count={t.count} />
            ))}
          </div>
        </div>
      )}

      {/* Top post */}
      {d.top_post && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#888',
              marginBottom: 10,
            }}
          >
            Top Post
          </div>
          <div
            style={{
              background: '#fafaf8',
              border: '1px solid #e8e4dc',
              borderRadius: 6,
              padding: '16px 20px',
            }}
          >
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: '#111',
                fontFamily: "'Space Grotesk', sans-serif",
                marginBottom: 8,
              }}
            >
              {truncate(d.top_post.text, 200)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#888',
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {d.top_post.ago}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weekly Section ──

function WeeklySection() {
  const { data: week, isLoading } = useDigestWeek();
  const d = week?.data;

  if (isLoading) {
    return (
      <div style={{ padding: '36px 44px', fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  if (!d) return null;

  const max = Math.max(...(d.daily_breakdown?.map((db) => db.count) ?? [1]), 1);

  return (
    <div style={{ padding: '0 44px 36px' }}>
      <SectionBadge label="This Week" />

      {/* Summary stats */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginBottom: 20,
          fontSize: 13,
          color: '#555',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <span>
          <strong style={{ color: '#111' }}>{num(d.total_posts)}</strong> posts
        </span>
        <span>
          <strong style={{ color: '#111' }}>{num(d.originals)}</strong> originals
        </span>
        <span>
          <strong style={{ color: '#111' }}>{num(d.replies)}</strong> replies
        </span>
      </div>

      {/* Top tags */}
      {d.top_tags && d.top_tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {d.top_tags.map((t) => (
            <TagPill key={t.tag} tag={t.tag} count={t.count} />
          ))}
        </div>
      )}

      {/* Daily breakdown */}
      {d.daily_breakdown && d.daily_breakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {d.daily_breakdown.map((db) => (
            <div
              key={db.day}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
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
                {db.day}
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
                    width: `${(db.count / max) * 100}%`,
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
                {db.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Topic Drift Section ──

function TopicDriftSection() {
  const { data: drift, isLoading } = useDrift();

  const items: DriftItem[] = drift?.data
    ? [...drift.data].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10)
    : [];

  if (isLoading) {
    return (
      <div style={{ padding: '0 44px 36px', fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div style={{ padding: '0 44px 36px' }}>
      <SectionBadge label="Topic Drift" />
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
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                {item.this_month} / {item.last_month}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bridges Section ──

function BridgesSection() {
  const { data: bridges, isLoading } = useBridges();

  const posts: Post[] = bridges?.data ?? [];

  if (isLoading) {
    return (
      <div style={{ padding: '0 44px 36px', fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
        loading...
      </div>
    );
  }

  if (posts.length === 0) return null;

  return (
    <div style={{ padding: '0 44px 36px' }}>
      <SectionBadge label="Bridges" />
      <div
        style={{
          fontSize: 12,
          color: '#888',
          marginBottom: 16,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        Posts that connect different topic clusters
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {posts.slice(0, 8).map((post) => (
          <div
            key={post.id}
            style={{
              background: '#fafaf8',
              border: '1px solid #e8e4dc',
              borderRadius: 6,
              padding: '14px 18px',
            }}
          >
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: '#111',
                fontFamily: "'Space Grotesk', sans-serif",
                marginBottom: 8,
              }}
            >
              {truncate(post.text, 160)}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: TAG_COLORS[tag] ?? '#888',
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                >
                  {tag}
                </span>
              ))}
              <span
                style={{
                  fontSize: 11,
                  color: '#aaa',
                  fontFamily: "'Share Tech Mono', monospace",
                  marginLeft: 'auto',
                }}
              >
                {post.ago}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──

export default function DigestPage() {
  const { data: brief } = useDigestBrief();
  const briefText = brief?.data?.brief ?? 'Compiling your daily and weekly digest';

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
        number="12"
        date={formatDate()}
        title="Digest"
        subtitle={briefText}
        tags={['DAILY', 'WEEKLY', 'DRIFT']}
        variant="dark"
      >
        <BriefPanel />
      </NudgeCard>

      {/* ── Today ── */}
      <TodaySection />

      {/* ── This Week ── */}
      <WeeklySection />

      {/* ── Topic Drift ── */}
      <TopicDriftSection />

      {/* ── Bridges ── */}
      <BridgesSection />
    </div>
  );
}
