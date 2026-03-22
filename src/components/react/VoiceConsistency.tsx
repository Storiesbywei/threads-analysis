import { useEffect, useState, useMemo, useRef } from 'react';

interface MonthData {
  month: string;
  ttr: number;
  avgWordCount: number;
  tagEntropy: number;
  postCount: number;
  uniqueWords: number;
  totalWords: number;
}

interface ApiResponse {
  post_count: number;
  month_count: number;
  months: MonthData[];
}

interface TooltipState {
  x: number;
  y: number;
  month: MonthData;
}

const MARGIN = { top: 20, right: 60, bottom: 50, left: 60 };
const VIEWBOX_W = 900;
const VIEWBOX_H = 350;
const PLOT_W = VIEWBOX_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEWBOX_H - MARGIN.top - MARGIN.bottom;

const LINE_COLORS = {
  ttr: '#58a6ff',
  tagEntropy: '#d2a8ff',
};

export default function VoiceConsistency() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch('/api/voice-consistency')
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
    if (!data || data.months.length === 0) return null;

    const months = data.months;

    // TTR scale (left y-axis)
    const ttrValues = months.map((m) => m.ttr);
    const ttrMin = Math.floor(Math.min(...ttrValues) * 100) / 100;
    const ttrMax = Math.ceil(Math.max(...ttrValues) * 100) / 100;
    const ttrRange = ttrMax - ttrMin || 0.1;

    // Tag entropy scale (right y-axis)
    const entropyValues = months.map((m) => m.tagEntropy);
    const entropyMin = Math.floor(Math.min(...entropyValues) * 10) / 10;
    const entropyMax = Math.ceil(Math.max(...entropyValues) * 10) / 10;
    const entropyRange = entropyMax - entropyMin || 0.5;

    const scaleX = (i: number) => (i / (months.length - 1)) * PLOT_W;
    const scaleTTR = (v: number) => PLOT_H - ((v - ttrMin) / ttrRange) * PLOT_H;
    const scaleEntropy = (v: number) => PLOT_H - ((v - entropyMin) / entropyRange) * PLOT_H;

    // Build paths
    const ttrPath = months
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleTTR(m.ttr).toFixed(1)}`)
      .join(' ');

    const entropyPath = months
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleEntropy(m.tagEntropy).toFixed(1)}`)
      .join(' ');

    // TTR y-ticks (left axis)
    const ttrTicks: number[] = [];
    const ttrStep = ttrRange / 4;
    for (let i = 0; i <= 4; i++) {
      ttrTicks.push(ttrMin + ttrStep * i);
    }

    // Entropy y-ticks (right axis)
    const entropyTicks: number[] = [];
    const entropyStep = entropyRange / 4;
    for (let i = 0; i <= 4; i++) {
      entropyTicks.push(entropyMin + entropyStep * i);
    }

    // X labels
    const labelInterval = Math.max(1, Math.floor(months.length / 10));
    const xLabels: { index: number; label: string }[] = [];
    for (let i = 0; i < months.length; i += labelInterval) {
      xLabels.push({ index: i, label: months[i].month });
    }

    // Moving averages (3-month window)
    const ttrMA: (number | null)[] = months.map((_, i) => {
      if (i < 2) return null;
      return (months[i].ttr + months[i - 1].ttr + months[i - 2].ttr) / 3;
    });

    const ttrMAPath = ttrMA
      .map((v, i) => {
        if (v === null) return null;
        return `${i === 2 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleTTR(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');

    // Compute overall trend direction for TTR
    const firstHalf = ttrValues.slice(0, Math.floor(ttrValues.length / 2));
    const secondHalf = ttrValues.slice(Math.floor(ttrValues.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const ttrTrend = secondAvg > firstAvg ? 'diversifying' : secondAvg < firstAvg ? 'narrowing' : 'stable';

    return {
      months, ttrMin, ttrMax, entropyMin, entropyMax,
      scaleX, scaleTTR, scaleEntropy,
      ttrPath, entropyPath, ttrMAPath,
      ttrTicks, entropyTicks, xLabels, ttrTrend,
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '8px',
        padding: '48px', textAlign: 'center', color: '#8b949e',
        fontFamily: "'SF Mono', monospace", fontSize: '0.875rem',
      }}>
        Loading voice consistency data...
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

  const {
    months, scaleX, scaleTTR, scaleEntropy,
    ttrPath, entropyPath, ttrMAPath,
    ttrTicks, entropyTicks, xLabels, ttrTrend,
  } = chart;

  const ttrOpacity = activeLine === null || activeLine === 'ttr' ? 1 : 0.2;
  const entropyOpacity = activeLine === null || activeLine === 'tagEntropy' ? 1 : 0.2;

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
          {data.month_count} months | {data.post_count.toLocaleString()} posts
        </div>
        <div style={{
          fontSize: '0.75rem', fontFamily: "'SF Mono', monospace",
          color: ttrTrend === 'diversifying' ? '#3fb950' : ttrTrend === 'narrowing' ? '#f0883e' : '#8b949e',
        }}>
          vocabulary: {ttrTrend}
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
            {ttrTicks.map((v, i) => (
              <line
                key={`grid-${i}`}
                x1={0} y1={scaleTTR(v)} x2={PLOT_W} y2={scaleTTR(v)}
                stroke="#21262d" strokeWidth={1}
              />
            ))}

            {/* Axes */}
            <line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />
            <line x1={0} y1={0} x2={0} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />
            <line x1={PLOT_W} y1={0} x2={PLOT_W} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />

            {/* Left Y-axis labels (TTR) */}
            {ttrTicks.map((v, i) => (
              <text
                key={`ttr-l-${i}`}
                x={-8} y={scaleTTR(v) + 4}
                fill={LINE_COLORS.ttr} fontSize="10" fontFamily="'SF Mono', monospace"
                textAnchor="end" opacity={ttrOpacity}
              >
                {v.toFixed(2)}
              </text>
            ))}

            {/* Right Y-axis labels (Tag Entropy) */}
            {entropyTicks.map((v, i) => (
              <text
                key={`ent-l-${i}`}
                x={PLOT_W + 8} y={scaleEntropy(v) + 4}
                fill={LINE_COLORS.tagEntropy} fontSize="10" fontFamily="'SF Mono', monospace"
                textAnchor="start" opacity={entropyOpacity}
              >
                {v.toFixed(1)}
              </text>
            ))}

            {/* Axis labels */}
            <text
              x={-PLOT_H / 2} y={-44}
              fill={LINE_COLORS.ttr} fontSize="11" fontFamily="-apple-system, sans-serif"
              textAnchor="middle" transform="rotate(-90)" opacity={ttrOpacity}
            >
              Type-Token Ratio (TTR)
            </text>
            <text
              x={PLOT_H / 2} y={PLOT_W + 48}
              fill={LINE_COLORS.tagEntropy} fontSize="11" fontFamily="-apple-system, sans-serif"
              textAnchor="middle" transform={`rotate(90, ${PLOT_W + 48}, ${PLOT_H / 2})`}
              opacity={entropyOpacity}
            >
              Tag Entropy (bits)
            </text>

            {/* X labels */}
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

            {/* TTR 3-month moving average (dashed) */}
            {ttrMAPath && (
              <path d={ttrMAPath} fill="none" stroke={LINE_COLORS.ttr}
                strokeWidth={2} strokeDasharray="6 3" opacity={0.3 * ttrOpacity} />
            )}

            {/* TTR line */}
            <path d={ttrPath} fill="none" stroke={LINE_COLORS.ttr}
              strokeWidth={1.5} opacity={ttrOpacity} style={{ transition: 'opacity 0.15s' }} />

            {/* Tag entropy line */}
            <path d={entropyPath} fill="none" stroke={LINE_COLORS.tagEntropy}
              strokeWidth={1.5} opacity={entropyOpacity} style={{ transition: 'opacity 0.15s' }} />

            {/* Interactive hit areas */}
            {months.map((m, i) => {
              const cx = scaleX(i);
              return (
                <rect
                  key={m.month}
                  x={cx - PLOT_W / months.length / 2}
                  y={0}
                  width={PLOT_W / months.length}
                  height={PLOT_H}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setTooltip({ x: cx, y: scaleTTR(m.ttr), month: m })}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}

            {/* Hover indicators */}
            {tooltip && (
              <>
                <line
                  x1={tooltip.x} y1={0} x2={tooltip.x} y2={PLOT_H}
                  stroke="#6e7681" strokeWidth={1} opacity={0.3}
                />
                <circle
                  cx={tooltip.x} cy={scaleTTR(tooltip.month.ttr)} r={4}
                  fill={LINE_COLORS.ttr} stroke="#0d1117" strokeWidth={2}
                />
                <circle
                  cx={tooltip.x} cy={scaleEntropy(tooltip.month.tagEntropy)} r={4}
                  fill={LINE_COLORS.tagEntropy} stroke="#0d1117" strokeWidth={2}
                />
              </>
            )}
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: `${((tooltip.x + MARGIN.left) / VIEWBOX_W) * 100}%`,
            top: `${((tooltip.y + MARGIN.top) / VIEWBOX_H) * 100}%`,
            transform: 'translate(-50%, -130%)',
            background: '#1c2128', border: '1px solid #30363d', borderRadius: '6px',
            padding: '8px 12px', pointerEvents: 'none', zIndex: 10,
            maxWidth: '280px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            <div style={{
              fontSize: '0.75rem', fontFamily: "'SF Mono', monospace",
              color: '#e6edf3', marginBottom: '4px', fontWeight: 600,
            }}>
              {tooltip.month.month}
            </div>
            <div style={{
              fontSize: '0.7rem', fontFamily: "'SF Mono', monospace",
              color: '#8b949e', lineHeight: '1.5',
            }}>
              <span style={{ color: LINE_COLORS.ttr }}>TTR: {tooltip.month.ttr.toFixed(4)}</span>
              {' | '}
              <span style={{ color: LINE_COLORS.tagEntropy }}>entropy: {tooltip.month.tagEntropy.toFixed(2)} bits</span>
              <br />
              {tooltip.month.postCount} posts | avg {tooltip.month.avgWordCount.toFixed(0)} words
              <br />
              {tooltip.month.uniqueWords.toLocaleString()} unique / {tooltip.month.totalWords.toLocaleString()} total
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: '20px', marginTop: '12px',
        fontSize: '0.75rem', fontFamily: "'SF Mono', monospace",
      }}>
        <span
          style={{
            color: activeLine === null || activeLine === 'ttr' ? LINE_COLORS.ttr : '#6e768140',
            cursor: 'pointer', transition: 'color 0.15s',
          }}
          onMouseEnter={() => setActiveLine('ttr')}
          onMouseLeave={() => setActiveLine(null)}
        >
          <span style={{
            display: 'inline-block', width: '16px', height: '2px',
            background: LINE_COLORS.ttr, marginRight: '6px', verticalAlign: 'middle',
          }} />
          Type-Token Ratio (vocabulary diversity)
        </span>
        <span
          style={{
            color: activeLine === null || activeLine === 'tagEntropy' ? LINE_COLORS.tagEntropy : '#6e768140',
            cursor: 'pointer', transition: 'color 0.15s',
          }}
          onMouseEnter={() => setActiveLine('tagEntropy')}
          onMouseLeave={() => setActiveLine(null)}
        >
          <span style={{
            display: 'inline-block', width: '16px', height: '2px',
            background: LINE_COLORS.tagEntropy, marginRight: '6px', verticalAlign: 'middle',
          }} />
          Tag Entropy (topic diversity)
        </span>
      </div>
    </div>
  );
}
