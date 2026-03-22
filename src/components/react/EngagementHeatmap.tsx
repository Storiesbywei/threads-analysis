import { useEffect, useState, useCallback } from 'react';

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
  avg: number;
}

type Metric = 'views' | 'likes';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12a';
  if (i < 12) return `${i}a`;
  if (i === 12) return '12p';
  return `${i - 12}p`;
});

function interpolateColor(t: number): string {
  // Dark (low) to bright green (high)
  // 0 → #0d1117 (bg), 0.5 → #1a4a2e (mid green), 1 → #3fb950 (success green)
  const r = Math.round(13 + t * (63 - 13));
  const g = Math.round(17 + t * (185 - 17));
  const b = Math.round(23 + t * (80 - 23));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function EngagementHeatmap() {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [metric, setMetric] = useState<Metric>('views');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const fetchData = useCallback(async (m: Metric) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagement-heatmap?metric=${m}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCells(data.cells || []);
    } catch (err) {
      console.error('Heatmap fetch failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(metric);
  }, [metric, fetchData]);

  // Build a lookup map: key = "day-hour" → cell
  const cellMap = new Map<string, HeatmapCell>();
  for (const cell of cells) {
    cellMap.set(`${cell.day}-${cell.hour}`, cell);
  }

  // Find min/max for color scaling
  const avgValues = cells.map((c) => c.avg).filter((v) => v > 0);
  const minAvg = avgValues.length > 0 ? Math.min(...avgValues) : 0;
  const maxAvg = avgValues.length > 0 ? Math.max(...avgValues) : 1;

  const cellSize = 32;
  const labelWidth = 40;
  const labelHeight = 28;
  const gap = 2;

  const handleMetricToggle = (m: Metric) => {
    setMetric(m);
  };

  const handleCellHover = (
    e: React.MouseEvent,
    day: number,
    hour: number,
    cell: HeatmapCell | undefined
  ) => {
    if (!cell) {
      setTooltip(null);
      return;
    }
    const dayName = DAY_LABELS[day];
    const hourLabel = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
    const avgFormatted = metric === 'views'
      ? Math.round(cell.avg).toLocaleString()
      : cell.avg.toFixed(1);
    const text = `${dayName} ${hourLabel}: avg ${avgFormatted} ${metric} (${cell.count} posts)`;
    setTooltip({ x: e.clientX, y: e.clientY, text });
  };

  const handleCellLeave = () => {
    setTooltip(null);
  };

  return (
    <div>
      {/* Controls row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['views', 'likes'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => handleMetricToggle(m)}
              style={{
                padding: '4px 12px',
                background: metric === m ? '#1f6feb' : '#161b22',
                border: `1px solid ${metric === m ? '#1f6feb' : '#30363d'}`,
                borderRadius: '6px',
                color: metric === m ? '#fff' : '#e6edf3',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontFamily: "'SF Mono', monospace",
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            color: '#6e7681',
            fontFamily: "'SF Mono', monospace",
          }}
        >
          {loading
            ? 'loading...'
            : error
              ? `error: ${error}`
              : `${cells.length} cells`}
        </div>
      </div>

      {/* Heatmap grid */}
      <div
        style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '16px',
          overflowX: 'auto',
          position: 'relative',
        }}
      >
        {loading ? (
          <div
            style={{
              height: `${7 * (cellSize + gap) + labelHeight + 20}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6e7681',
              fontFamily: "'SF Mono', monospace",
              fontSize: '0.875rem',
            }}
          >
            Loading heatmap...
          </div>
        ) : error ? (
          <div
            style={{
              height: `${7 * (cellSize + gap) + labelHeight + 20}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f85149',
              fontFamily: "'SF Mono', monospace",
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        ) : (
          <div style={{ minWidth: `${labelWidth + 24 * (cellSize + gap)}px` }}>
            {/* Hour labels */}
            <div
              style={{
                display: 'flex',
                marginLeft: `${labelWidth}px`,
                marginBottom: '4px',
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  style={{
                    width: `${cellSize}px`,
                    marginRight: `${gap}px`,
                    textAlign: 'center',
                    fontSize: '0.625rem',
                    color: '#6e7681',
                    fontFamily: "'SF Mono', monospace",
                  }}
                >
                  {HOUR_LABELS[h]}
                </div>
              ))}
            </div>

            {/* Rows */}
            {DAY_LABELS.map((dayLabel, dayIndex) => (
              <div
                key={dayIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: `${gap}px`,
                }}
              >
                {/* Day label */}
                <div
                  style={{
                    width: `${labelWidth}px`,
                    fontSize: '0.6875rem',
                    color: '#8b949e',
                    fontFamily: "'SF Mono', monospace",
                    textAlign: 'right',
                    paddingRight: '8px',
                    flexShrink: 0,
                  }}
                >
                  {dayLabel}
                </div>

                {/* Hour cells */}
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = cellMap.get(`${dayIndex}-${h}`);
                  const avg = cell?.avg || 0;
                  const t =
                    maxAvg > minAvg && avg > 0
                      ? (avg - minAvg) / (maxAvg - minAvg)
                      : 0;
                  const bgColor = avg > 0 ? interpolateColor(t) : '#161b22';

                  return (
                    <div
                      key={h}
                      onMouseEnter={(e) =>
                        handleCellHover(e, dayIndex, h, cell)
                      }
                      onMouseMove={(e) =>
                        handleCellHover(e, dayIndex, h, cell)
                      }
                      onMouseLeave={handleCellLeave}
                      style={{
                        width: `${cellSize}px`,
                        height: `${cellSize}px`,
                        marginRight: `${gap}px`,
                        backgroundColor: bgColor,
                        borderRadius: '3px',
                        cursor: cell ? 'pointer' : 'default',
                        transition: 'opacity 0.1s',
                        border: '1px solid rgba(48, 54, 61, 0.3)',
                      }}
                    />
                  );
                })}
              </div>
            ))}

            {/* Color legend */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '12px',
                marginLeft: `${labelWidth}px`,
                gap: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '0.625rem',
                  color: '#6e7681',
                  fontFamily: "'SF Mono', monospace",
                }}
              >
                Less
              </span>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <div
                  key={t}
                  style={{
                    width: '14px',
                    height: '14px',
                    backgroundColor:
                      t === 0 ? '#161b22' : interpolateColor(t),
                    borderRadius: '2px',
                    border: '1px solid rgba(48, 54, 61, 0.3)',
                  }}
                />
              ))}
              <span
                style={{
                  fontSize: '0.625rem',
                  color: '#6e7681',
                  fontFamily: "'SF Mono', monospace",
                }}
              >
                More
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltip.x + 12}px`,
            top: `${tooltip.y - 8}px`,
            background: '#1c2128',
            border: '1px solid #30363d',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.75rem',
            color: '#e6edf3',
            fontFamily: "'SF Mono', monospace",
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
