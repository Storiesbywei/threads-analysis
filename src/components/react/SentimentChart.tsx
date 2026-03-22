import { useEffect, useState } from 'react';

interface UserSentiment {
  username: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  dominantSentiment: 'positive' | 'negative' | 'neutral';
}

interface RecentReply {
  text: string;
  username: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  rootTag: string | null;
  timestamp: string;
}

interface ApiResponse {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byUser: UserSentiment[];
  recentReplies: RecentReply[];
}

const SENTIMENT_COLORS = {
  positive: '#3fb950',
  negative: '#f85149',
  neutral: '#6e7681',
};

const SENTIMENT_LABELS = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
};

export default function SentimentChart() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reply-sentiment')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ApiResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '8px',
        padding: '48px', textAlign: 'center', color: '#8b949e',
        fontFamily: "'SF Mono', monospace", fontSize: '0.875rem',
      }}>
        Loading sentiment data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #f8514933', borderRadius: '8px',
        padding: '24px', color: '#f85149',
        fontFamily: "'SF Mono', monospace", fontSize: '0.875rem',
      }}>
        Error: {error}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '8px',
        padding: '24px', color: '#8b949e',
        fontFamily: "'SF Mono', monospace", fontSize: '0.875rem',
      }}>
        No reply data available. Run the reply backfill script first.
      </div>
    );
  }

  // Donut chart geometry
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 85;
  const innerR = 55;
  const total = data.total;

  const slices: { key: string; count: number; color: string; label: string }[] = [
    { key: 'positive', count: data.positive, color: SENTIMENT_COLORS.positive, label: SENTIMENT_LABELS.positive },
    { key: 'negative', count: data.negative, color: SENTIMENT_COLORS.negative, label: SENTIMENT_LABELS.negative },
    { key: 'neutral', count: data.neutral, color: SENTIMENT_COLORS.neutral, label: SENTIMENT_LABELS.neutral },
  ];

  // Build donut arcs
  let startAngle = -Math.PI / 2;
  const arcs = slices.map((slice) => {
    const fraction = slice.count / total;
    const angle = fraction * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1Outer = cx + outerR * Math.cos(startAngle);
    const y1Outer = cy + outerR * Math.sin(startAngle);
    const x2Outer = cx + outerR * Math.cos(endAngle);
    const y2Outer = cy + outerR * Math.sin(endAngle);
    const x1Inner = cx + innerR * Math.cos(endAngle);
    const y1Inner = cy + innerR * Math.sin(endAngle);
    const x2Inner = cx + innerR * Math.cos(startAngle);
    const y2Inner = cy + innerR * Math.sin(startAngle);

    const d = [
      `M ${x1Outer} ${y1Outer}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
      `L ${x1Inner} ${y1Inner}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
      'Z',
    ].join(' ');

    startAngle = endAngle;

    return { ...slice, d, fraction };
  });

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div style={{
          fontSize: '0.75rem', color: '#6e7681', fontFamily: "'SF Mono', monospace",
        }}>
          {total.toLocaleString()} replies analyzed
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '200px 1fr', gap: '24px',
        alignItems: 'start',
      }}>
        {/* Donut chart */}
        <div style={{
          background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px',
          padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: '180px' }}>
            {arcs.map((arc) => (
              <path
                key={arc.key}
                d={arc.d}
                fill={arc.color}
                opacity={hoveredSlice === null || hoveredSlice === arc.key ? 0.85 : 0.3}
                stroke="#0d1117"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHoveredSlice(arc.key)}
                onMouseLeave={() => setHoveredSlice(null)}
              />
            ))}
            {/* Center text */}
            <text x={cx} y={cy - 4} textAnchor="middle" fill="#e6edf3"
              fontSize="18" fontWeight="600" fontFamily="'SF Mono', monospace">
              {total.toLocaleString()}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="#6e7681"
              fontSize="9" fontFamily="'SF Mono', monospace">
              replies
            </text>
          </svg>

          {/* Legend */}
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            {arcs.map((arc) => (
              <div key={arc.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '0.7rem', fontFamily: "'SF Mono', monospace",
                color: hoveredSlice === null || hoveredSlice === arc.key ? '#e6edf3' : '#6e768160',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
                onMouseEnter={() => setHoveredSlice(arc.key)}
                onMouseLeave={() => setHoveredSlice(null)}
              >
                <span>
                  <span style={{
                    display: 'inline-block', width: '8px', height: '8px',
                    borderRadius: '50%', background: arc.color, marginRight: '6px',
                    opacity: hoveredSlice === null || hoveredSlice === arc.key ? 0.85 : 0.3,
                  }} />
                  {arc.label}
                </span>
                <span>{arc.count.toLocaleString()} ({(arc.fraction * 100).toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: top commenters + recent replies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top commenters */}
          <div style={{
            background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px',
            padding: '12px',
          }}>
            <div style={{
              fontSize: '0.75rem', color: '#8b949e', fontFamily: "'SF Mono', monospace",
              marginBottom: '8px', fontWeight: 600,
            }}>
              Top Commenters
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {data.byUser.slice(0, 10).map((user) => {
                const barWidth = total > 0 ? (user.total / data.byUser[0].total) * 100 : 0;
                return (
                  <div key={user.username} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.7rem', fontFamily: "'SF Mono', monospace",
                  }}>
                    <span style={{ color: '#e6edf3', width: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      @{user.username}
                    </span>
                    <div style={{ flex: 1, height: '14px', background: '#161b22', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                      {user.positive > 0 && (
                        <div style={{ width: `${(user.positive / user.total) * barWidth}%`, background: SENTIMENT_COLORS.positive, height: '100%' }} />
                      )}
                      {user.neutral > 0 && (
                        <div style={{ width: `${(user.neutral / user.total) * barWidth}%`, background: SENTIMENT_COLORS.neutral, height: '100%' }} />
                      )}
                      {user.negative > 0 && (
                        <div style={{ width: `${(user.negative / user.total) * barWidth}%`, background: SENTIMENT_COLORS.negative, height: '100%' }} />
                      )}
                    </div>
                    <span style={{ color: '#6e7681', width: '30px', textAlign: 'right', flexShrink: 0 }}>
                      {user.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent replies */}
          <div style={{
            background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px',
            padding: '12px', maxHeight: '280px', overflowY: 'auto',
          }}>
            <div style={{
              fontSize: '0.75rem', color: '#8b949e', fontFamily: "'SF Mono', monospace",
              marginBottom: '8px', fontWeight: 600,
            }}>
              Recent Replies
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.recentReplies.slice(0, 15).map((reply, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '8px', fontSize: '0.7rem',
                  fontFamily: "'SF Mono', monospace", lineHeight: '1.4',
                  paddingBottom: '6px', borderBottom: '1px solid #21262d',
                }}>
                  <span style={{
                    display: 'inline-block', width: '6px', height: '6px',
                    borderRadius: '50%', background: SENTIMENT_COLORS[reply.sentiment],
                    marginTop: '4px', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#58a6ff' }}>@{reply.username}</span>
                    {reply.rootTag && (
                      <span style={{ color: '#6e7681' }}> on {reply.rootTag}</span>
                    )}
                    <div style={{ color: '#8b949e', marginTop: '2px' }}>
                      {reply.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
