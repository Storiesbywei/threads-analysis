import NudgeCard from '@/components/primitives/NudgeCard';
import { useMentions, useInteractions } from '@/hooks/useApi';
import type { MentionUser, InteractionUser } from '@/lib/types';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Stats Row ──

function StatsRow({
  totalMentions,
  totalInteractions,
  uniqueUsers,
}: {
  totalMentions: number;
  totalInteractions: number;
  uniqueUsers: number;
}) {
  const stats = [
    { label: 'MENTIONS', value: totalMentions },
    { label: 'INTERACTIONS', value: totalInteractions },
    { label: 'UNIQUE USERS', value: uniqueUsers },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid #e5e5e3',
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            flex: 1,
            padding: '28px 44px',
            borderRight: '1px solid #e5e5e3',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 'clamp(24px, 5vw, 36px)',
              fontWeight: 700,
              color: '#111',
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            {stat.value.toLocaleString()}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#888',
            }}
          >
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mentions Section ──

function MentionsSection() {
  const { data, isLoading } = useMentions();

  const items: MentionUser[] = data?.data
    ? [...data.data].sort((a, b) => b.mention_count - a.mention_count).slice(0, 20)
    : [];

  const maxCount = items.length > 0 ? items[0]!.mention_count : 1;

  return (
    <div style={{ flex: 1, minWidth: 280 }}>
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
        MENTIONS
      </span>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((user) => {
            const barWidth = maxCount > 0 ? (user.mention_count / maxCount) * 100 : 0;
            return (
              <div
                key={user.username}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#111',
                    minWidth: 120,
                    flexShrink: 0,
                  }}
                >
                  @{user.username}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    backgroundColor: '#e5e5e3',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      backgroundColor: '#FF5500',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 12,
                    color: '#555',
                    minWidth: 36,
                    textAlign: 'right',
                  }}
                >
                  {user.mention_count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Interactions Section ──

function InteractionsSection() {
  const { data, isLoading } = useInteractions();

  const items: InteractionUser[] = data?.data
    ? [...data.data].sort((a, b) => b.reply_count - a.reply_count).slice(0, 20)
    : [];

  const maxCount = items.length > 0 ? items[0]!.reply_count : 1;

  return (
    <div style={{ flex: 1, minWidth: 280 }}>
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
        INTERACTIONS
      </span>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((user) => {
            const barWidth = maxCount > 0 ? (user.reply_count / maxCount) * 100 : 0;
            return (
              <div
                key={user.reply_username}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#111',
                    minWidth: 120,
                    flexShrink: 0,
                  }}
                >
                  @{user.reply_username}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    backgroundColor: '#e5e5e3',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      backgroundColor: '#111',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 12,
                    color: '#555',
                    minWidth: 36,
                    textAlign: 'right',
                  }}
                >
                  {user.reply_count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hero Right Panel ──

function HeroPanel({ uniqueUsers }: { uniqueUsers: number }) {
  return (
    <div style={{ padding: '36px 32px', width: '100%' }}>
      <div
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 'clamp(36px, 10vw, 64px)',
          fontWeight: 700,
          color: '#fff',
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {uniqueUsers}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#aaa',
        }}
      >
        unique users
      </div>
    </div>
  );
}

// ── Page ──

export default function NetworkPage() {
  const { data: mentionsData } = useMentions();
  const { data: interactionsData } = useInteractions();

  const mentions: MentionUser[] = mentionsData?.data ?? [];
  const interactions: InteractionUser[] = interactionsData?.data ?? [];

  const totalMentions = mentions.reduce((sum, m) => sum + m.mention_count, 0);
  const totalInteractions = interactions.reduce((sum, u) => sum + u.reply_count, 0);

  // Unique users across both lists
  const allUsernames = new Set([
    ...mentions.map((m) => m.username),
    ...interactions.map((u) => u.reply_username),
  ]);
  const uniqueUsers = allUsernames.size;

  const subtitle = uniqueUsers > 0
    ? `${uniqueUsers} unique users across mentions and interactions`
    : 'Mapping the social graph...';

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <NudgeCard
        number="08"
        date={formatDate()}
        title="Network"
        subtitle={subtitle}
        tags={['SOCIAL', 'MENTIONS', 'REPLIES']}
        variant="dark"
      >
        <HeroPanel uniqueUsers={uniqueUsers} />
      </NudgeCard>

      <StatsRow
        totalMentions={totalMentions}
        totalInteractions={totalInteractions}
        uniqueUsers={uniqueUsers}
      />

      {/* Two-column layout, stacked on mobile */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 280, padding: '36px 44px', borderRight: '1px solid #e5e5e3' }}>
          <MentionsSection />
        </div>
        <div style={{ flex: 1, minWidth: 280, padding: '36px 44px' }}>
          <InteractionsSection />
        </div>
      </div>
    </div>
  );
}
