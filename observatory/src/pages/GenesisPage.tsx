import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import NudgeCard from '@/components/primitives/NudgeCard';
import { useGenealogyTopics } from '@/hooks/useApi';
import { fetchGenealogyTimeline, fetchGenealogyConnections } from '@/lib/api';
import type { GenealogyTopic, GenealogyTimeline, GenealogyConnection } from '@/lib/types';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Topic Selector ──

function TopicSelector({
  topics,
  selected,
  onSelect,
}: {
  topics: GenealogyTopic[];
  selected: string | null;
  onSelect: (topic: string) => void;
}) {
  const sorted = [...topics].sort((a, b) => b.mentions - a.mentions);

  return (
    <div style={{ flex: '0 0 280px', minWidth: 240 }}>
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
        TOPICS
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sorted.map((topic) => {
          const isActive = selected === topic.topic;
          return (
            <button
              key={topic.topic}
              onClick={() => onSelect(topic.topic)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                background: isActive ? '#111' : 'transparent',
                color: isActive ? '#fff' : '#111',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 13,
                fontWeight: isActive ? 700 : 400,
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {topic.topic}
              </span>
              <span
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 11,
                  color: isActive ? '#aaa' : '#888',
                  flexShrink: 0,
                }}
              >
                {topic.mentions}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline Section ──

function TimelineSection({ topic }: { topic: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['genealogy', 'timeline', topic],
    queryFn: () => fetchGenealogyTimeline(topic),
    enabled: !!topic,
    staleTime: 300_000,
  });

  const items: GenealogyTimeline[] = data?.data ?? [];
  const maxCount = items.length > 0 ? Math.max(...items.map((t) => t.count)) : 1;

  return (
    <div>
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
        TIMELINE
      </span>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          loading...
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          No timeline data for this topic.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => {
            const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            return (
              <div
                key={item.month}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 12,
                    color: '#555',
                    minWidth: 72,
                    flexShrink: 0,
                  }}
                >
                  {item.month}
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
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 12,
                    color: '#555',
                    minWidth: 28,
                    textAlign: 'right',
                  }}
                >
                  {item.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Connections Section ──

function ConnectionsSection({ topic }: { topic: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['genealogy', 'connections', topic],
    queryFn: () => fetchGenealogyConnections(topic),
    enabled: !!topic,
    staleTime: 300_000,
  });

  const items: GenealogyConnection[] = data?.data ?? [];
  const sorted = [...items].sort((a, b) => b.co_occurrence_count - a.co_occurrence_count);
  const maxWeight = sorted.length > 0 ? sorted[0]!.co_occurrence_count : 1;

  return (
    <div>
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
        CONNECTIONS
      </span>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          loading...
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          No connections found for this topic.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((conn) => {
            const otherTopic = conn.source_topic === topic ? conn.target_topic : conn.source_topic;
            const barWidth = maxWeight > 0 ? (conn.co_occurrence_count / maxWeight) * 100 : 0;
            return (
              <div
                key={`${conn.source_topic}-${conn.target_topic}`}
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
                    minWidth: 100,
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {otherTopic}
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
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 12,
                    color: '#555',
                    minWidth: 28,
                    textAlign: 'right',
                  }}
                >
                  {conn.co_occurrence_count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hero Panel ──

function HeroPanel({ topicCount }: { topicCount: number }) {
  return (
    <div style={{ padding: '36px 32px', width: '100%' }}>
      <div
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 'clamp(36px, 10vw, 64px)',
          fontWeight: 700,
          color: '#111',
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {topicCount}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#555',
        }}
      >
        tracked topics
      </div>
    </div>
  );
}

// ── Empty State ──

function EmptyDetail() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 44px',
        color: '#888',
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 14,
      }}
    >
      Select a topic to view its timeline and connections.
    </div>
  );
}

// ── Page ──

export default function GenesisPage() {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const { data: topicsData } = useGenealogyTopics();

  const topics: GenealogyTopic[] = topicsData?.data ?? [];
  const topicCount = topics.length;

  const subtitle = topicCount > 0
    ? `${topicCount} topics tracked across your posting history`
    : 'Mapping topic evolution over time...';

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <NudgeCard
        number="09"
        date={formatDate()}
        title="Genesis"
        subtitle={subtitle}
        tags={['TOPICS', 'EVOLUTION', 'GENEALOGY']}
        variant="default"
      >
        <HeroPanel topicCount={topicCount} />
      </NudgeCard>

      {/* Main content: topic selector + detail panels */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0,
        }}
      >
        {/* Left: topic list */}
        <div
          style={{
            padding: '36px 44px',
            borderRight: '1px solid #e5e5e3',
            maxHeight: 600,
            overflowY: 'auto',
          }}
        >
          <TopicSelector
            topics={topics}
            selected={selectedTopic}
            onSelect={setSelectedTopic}
          />
        </div>

        {/* Right: detail panels */}
        {selectedTopic ? (
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ padding: '36px 44px', borderBottom: '1px solid #e5e5e3' }}>
              <TimelineSection topic={selectedTopic} />
            </div>
            <div style={{ padding: '36px 44px' }}>
              <ConnectionsSection topic={selectedTopic} />
            </div>
          </div>
        ) : (
          <EmptyDetail />
        )}
      </div>
    </div>
  );
}
