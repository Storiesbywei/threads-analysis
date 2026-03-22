import { useEffect, useState, useMemo, useRef } from 'react';

interface WeekData {
  week: string;
  kl: number;
  topDrift: string;
  postCount: number;
  topDriftContribution: number;
}

interface ApiResponse {
  window: string;
  post_count: number;
  tag_count: number;
  week_count: number;
  weeks: WeekData[];
}

interface TooltipState {
  x: number;
  y: number;
  week: WeekData;
}

const MARGIN = { top: 20, right: 30, bottom: 50, left: 60 };
const VIEWBOX_W = 900;
const VIEWBOX_H = 350;
const PLOT_W = VIEWBOX_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEWBOX_H - MARGIN.top - MARGIN.bottom;

export default function KLTimeline() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch('/api/kl-divergence?window=week')
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

  const chart = useMemo(() => {
    if (!data || data.weeks.length === 0) return null;

    const weeks = data.weeks;
    const klValues = weeks.map((w) => w.kl);
    const maxKL = Math.max(...klValues);
    const yMax = Math.ceil(maxKL * 10) / 10 || 0.5;

    const scaleX = (i: number) => (i / (weeks.length - 1)) * PLOT_W;
    const scaleY = (kl: number) => PLOT_H - (kl / yMax) * PLOT_H;

    // Build SVG path for the line
    const pathD = weeks
      .map((w, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(w.kl).toFixed(1)}`)
      .join(' ');

    // Build area path (for fill under curve)
    const areaD = pathD
      + ` L ${scaleX(weeks.length - 1).toFixed(1)} ${PLOT_H}`
      + ` L ${scaleX(0).toFixed(1)} ${PLOT_H} Z`;

    // Y ticks
    const yTickCount = 5;
    const yTicks: number[] = [];
    for (let i = 0; i <= yTickCount; i++) {
      yTicks.push((yMax / yTickCount) * i);
    }

    // X label ticks — show roughly 8-12 labels
    const labelInterval = Math.max(1, Math.floor(weeks.length / 10));
    const xLabels: { index: number; label: string }[] = [];
    for (let i = 0; i < weeks.length; i += labelInterval) {
      xLabels.push({ index: i, label: weeks[i].week });
    }

    // Find top 5 spike weeks
    const spikes = [...weeks]
      .sort((a, b) => b.kl - a.kl)
      .slice(0, 5);

    // Mean KL for reference line
    const meanKL = klValues.reduce((a, b) => a + b, 0) / klValues.length;

    return { weeks, yMax, scaleX, scaleY, pathD, areaD, yTicks, xLabels, spikes, meanKL };
  }, [data]);

  if (loading) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '8px',
        padding: '48px', textAlign: 'center', color: '#8b949e',
        fontFamily: "'SF Mono', monospace", fontSize: '0.875rem',
      }}>
        Loading KL divergence data...
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

  if (!data || !chart) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '8px',
        padding: '24px', color: '#8b949e',
        fontFamily: "'SF Mono', monospace", fontSize: '0.875rem',
      }}>
        No data available.
      </div>
    );
  }

  const { weeks, scaleX, scaleY, pathD, areaD, yTicks, xLabels, spikes, meanKL } = chart;

  return (
    <div>
      {/* Header stats */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div style={{
          fontSize: '0.75rem', color: '#6e7681',
          fontFamily: "'SF Mono', monospace",
        }}>
          {data.week_count} weeks | {data.post_count.toLocaleString()} posts
        </div>
        <div style={{
          fontSize: '0.75rem', color: '#8b949e',
          fontFamily: "'SF Mono', monospace",
        }}>
          mean KL = {meanKL.toFixed(4)} bits
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{
        background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px',
        overflow: 'hidden', position: 'relative',
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {/* Grid lines */}
            {yTicks.map((v) => (
              <line
                key={`yg-${v}`}
                x1={0} y1={scaleY(v)} x2={PLOT_W} y2={scaleY(v)}
                stroke="#21262d" strokeWidth={1}
              />
            ))}

            {/* Mean reference line */}
            <line
              x1={0} y1={scaleY(meanKL)} x2={PLOT_W} y2={scaleY(meanKL)}
              stroke="#6e7681" strokeWidth={1} strokeDasharray="4 4" opacity={0.5}
            />
            <text
              x={PLOT_W - 4} y={scaleY(meanKL) - 4}
              fill="#6e7681" fontSize="10" fontFamily="'SF Mono', monospace"
              textAnchor="end"
            >
              mean
            </text>

            {/* Axes */}
            <line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />
            <line x1={0} y1={0} x2={0} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />

            {/* Y tick labels */}
            {yTicks.map((v) => (
              <text
                key={`yl-${v}`}
                x={-8} y={scaleY(v) + 4}
                fill="#6e7681" fontSize="10" fontFamily="'SF Mono', monospace"
                textAnchor="end"
              >
                {v.toFixed(2)}
              </text>
            ))}

            {/* X tick labels */}
            {xLabels.map(({ index, label }) => (
              <text
                key={`xl-${index}`}
                x={scaleX(index)} y={PLOT_H + 18}
                fill="#6e7681" fontSize="9" fontFamily="'SF Mono', monospace"
                textAnchor="middle"
                transform={`rotate(-30, ${scaleX(index)}, ${PLOT_H + 18})`}
              >
                {label}
              </text>
            ))}

            {/* Y axis label */}
            <text
              x={-PLOT_H / 2} y={-44}
              fill="#8b949e" fontSize="11" fontFamily="-apple-system, sans-serif"
              textAnchor="middle" transform="rotate(-90)"
            >
              KL divergence (bits)
            </text>

            {/* Area fill */}
            <path d={areaD} fill="#58a6ff" opacity={0.08} />

            {/* Line */}
            <path d={pathD} fill="none" stroke="#58a6ff" strokeWidth={1.5} />

            {/* Interactive hit areas + spike markers */}
            {weeks.map((w, i) => {
              const cx = scaleX(i);
              const cy = scaleY(w.kl);
              const isSpike = spikes.includes(w);

              return (
                <g key={w.week}>
                  {isSpike && (
                    <circle
                      cx={cx} cy={cy} r={4}
                      fill="#f0883e" stroke="#0d1117" strokeWidth={1.5}
                    />
                  )}
                  <rect
                    x={cx - PLOT_W / weeks.length / 2}
                    y={0}
                    width={PLOT_W / weeks.length}
                    height={PLOT_H}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setTooltip({ x: cx, y: cy, week: w })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </g>
              );
            })}

            {/* Hover crosshair + dot */}
            {tooltip && (
              <>
                <line
                  x1={tooltip.x} y1={0} x2={tooltip.x} y2={PLOT_H}
                  stroke="#58a6ff" strokeWidth={1} opacity={0.3}
                />
                <circle
                  cx={tooltip.x} cy={tooltip.y} r={5}
                  fill="#58a6ff" stroke="#0d1117" strokeWidth={2}
                />
              </>
            )}
          </g>
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: `${((tooltip.x + MARGIN.left) / VIEWBOX_W) * 100}%`,
            top: `${((tooltip.y + MARGIN.top) / VIEWBOX_H) * 100}%`,
            transform: 'translate(-50%, -120%)',
            background: '#1c2128', border: '1px solid #30363d', borderRadius: '6px',
            padding: '8px 12px', pointerEvents: 'none', zIndex: 10,
            maxWidth: '260px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            <div style={{
              fontSize: '0.75rem', fontFamily: "'SF Mono', monospace", color: '#e6edf3',
              marginBottom: '2px',
            }}>
              <strong>{tooltip.week.week}</strong> — KL = {tooltip.week.kl.toFixed(4)} bits
            </div>
            <div style={{
              fontSize: '0.7rem', color: '#8b949e', fontFamily: "'SF Mono', monospace",
            }}>
              top drift: <span style={{ color: '#f0883e' }}>{tooltip.week.topDrift}</span>
              {' | '}{tooltip.week.postCount} posts
            </div>
          </div>
        )}
      </div>

      {/* Top spike weeks */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px',
      }}>
        {spikes.map((w) => (
          <div key={w.week} style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
            padding: '6px 10px', fontSize: '0.7rem', fontFamily: "'SF Mono', monospace",
            color: '#e6edf3',
          }}>
            <span style={{ color: '#f0883e' }}>{w.week}</span>
            {' '}{w.kl.toFixed(3)} bits
            {' '}
            <span style={{ color: '#6e7681' }}>({w.topDrift})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
