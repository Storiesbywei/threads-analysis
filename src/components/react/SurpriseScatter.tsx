import { useEffect, useState, useRef, useMemo } from 'react';
import { TAG_COLORS } from '../../lib/colors';

interface ScatterPoint {
  id: string;
  surprise: number;
  views: number;
  likes: number;
  tag: string;
  text_preview: string;
  timestamp: string;
}

interface ApiResponse {
  metric: string;
  correlation: number;
  count: number;
  points: ScatterPoint[];
}

interface TooltipState {
  x: number;
  y: number;
  point: ScatterPoint;
}

// Chart layout constants
const MARGIN = { top: 30, right: 30, bottom: 50, left: 70 };
const VIEWBOX_W = 800;
const VIEWBOX_H = 500;
const PLOT_W = VIEWBOX_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEWBOX_H - MARGIN.top - MARGIN.bottom;

function tagColor(tag: string): string {
  return TAG_COLORS[tag] || '#6e7681';
}

/** Linear regression: returns { slope, intercept } */
function linearRegression(
  points: ScatterPoint[],
  xKey: 'surprise',
  yKey: 'views'
): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (const p of points) {
    const x = p[xKey];
    const y = Math.log10(p[yKey]); // log scale for y
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export default function SurpriseScatter() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch('/api/surprise-engagement?metric=views&limit=2000')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ApiResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Compute scales, ticks, regression
  const chart = useMemo(() => {
    if (!data || data.points.length === 0) return null;

    const points = data.points;

    // X domain: surprise (bits/word)
    const xValues = points.map((p) => p.surprise);
    const xMin = Math.floor(Math.min(...xValues) * 10) / 10;
    const xMax = Math.ceil(Math.max(...xValues) * 10) / 10;

    // Y domain: views (log scale)
    const yValues = points.map((p) => p.views).filter((v) => v > 0);
    const yMinLog = Math.floor(Math.log10(Math.min(...yValues)));
    const yMaxLog = Math.ceil(Math.log10(Math.max(...yValues)));

    // Scale functions
    const scaleX = (val: number) =>
      ((val - xMin) / (xMax - xMin)) * PLOT_W;
    const scaleY = (val: number) => {
      const logVal = Math.log10(Math.max(1, val));
      return PLOT_H - ((logVal - yMinLog) / (yMaxLog - yMinLog)) * PLOT_H;
    };

    // X ticks
    const xStep = (xMax - xMin) > 4 ? 1 : 0.5;
    const xTicks: number[] = [];
    for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) {
      xTicks.push(Math.round(v * 10) / 10);
    }

    // Y ticks (powers of 10)
    const yTicks: number[] = [];
    for (let exp = yMinLog; exp <= yMaxLog; exp++) {
      yTicks.push(Math.pow(10, exp));
    }

    // Linear regression on log-scale y
    const validPoints = points.filter((p) => p.views > 0);
    const regression = linearRegression(validPoints, 'surprise', 'views');

    // Trend line endpoints
    const trendX1 = xMin;
    const trendX2 = xMax;
    const trendY1 = Math.pow(10, regression.slope * trendX1 + regression.intercept);
    const trendY2 = Math.pow(10, regression.slope * trendX2 + regression.intercept);

    // Unique tags for legend
    const tagCounts: Record<string, number> = {};
    for (const p of points) {
      tagCounts[p.tag] = (tagCounts[p.tag] || 0) + 1;
    }
    const legendTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return {
      points,
      xMin,
      xMax,
      yMinLog,
      yMaxLog,
      scaleX,
      scaleY,
      xTicks,
      yTicks,
      trendX1,
      trendX2,
      trendY1,
      trendY2,
      legendTags,
    };
  }, [data]);

  const handleMouseEnter = (point: ScatterPoint, cx: number, cy: number) => {
    if (!svgRef.current) return;
    setTooltip({ x: cx, y: cy, point });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  // --- Render states ---

  if (loading) {
    return (
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '48px',
          textAlign: 'center',
          color: '#8b949e',
          fontFamily: "'SF Mono', monospace",
          fontSize: '0.875rem',
        }}
      >
        Loading scatter data...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: '#161b22',
          border: '1px solid #f8514933',
          borderRadius: '8px',
          padding: '24px',
          color: '#f85149',
          fontFamily: "'SF Mono', monospace",
          fontSize: '0.875rem',
        }}
      >
        Error: {error}
      </div>
    );
  }

  if (!data || !chart) {
    return (
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '24px',
          color: '#8b949e',
          fontFamily: "'SF Mono', monospace",
          fontSize: '0.875rem',
        }}
      >
        No data available.
      </div>
    );
  }

  const { scaleX, scaleY, xTicks, yTicks, legendTags } = chart;

  return (
    <div>
      {/* Header bar with stats */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            color: '#6e7681',
            fontFamily: "'SF Mono', monospace",
          }}
        >
          {data.count.toLocaleString()} posts
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            fontFamily: "'SF Mono', monospace",
            color: Math.abs(data.correlation) > 0.3 ? '#58a6ff' : '#8b949e',
          }}
        >
          Pearson r = {data.correlation.toFixed(3)}
        </div>
      </div>

      {/* SVG Chart */}
      <div
        style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {/* Grid lines */}
            {xTicks.map((v) => (
              <line
                key={`xg-${v}`}
                x1={scaleX(v)}
                y1={0}
                x2={scaleX(v)}
                y2={PLOT_H}
                stroke="#21262d"
                strokeWidth={1}
              />
            ))}
            {yTicks.map((v) => (
              <line
                key={`yg-${v}`}
                x1={0}
                y1={scaleY(v)}
                x2={PLOT_W}
                y2={scaleY(v)}
                stroke="#21262d"
                strokeWidth={1}
              />
            ))}

            {/* Axes */}
            <line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />
            <line x1={0} y1={0} x2={0} y2={PLOT_H} stroke="#6e7681" strokeWidth={1} />

            {/* X tick labels */}
            {xTicks.map((v) => (
              <text
                key={`xl-${v}`}
                x={scaleX(v)}
                y={PLOT_H + 20}
                fill="#6e7681"
                fontSize="11"
                fontFamily="'SF Mono', monospace"
                textAnchor="middle"
              >
                {v.toFixed(1)}
              </text>
            ))}

            {/* Y tick labels */}
            {yTicks.map((v) => (
              <text
                key={`yl-${v}`}
                x={-10}
                y={scaleY(v) + 4}
                fill="#6e7681"
                fontSize="11"
                fontFamily="'SF Mono', monospace"
                textAnchor="end"
              >
                {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString()}
              </text>
            ))}

            {/* Axis labels */}
            <text
              x={PLOT_W / 2}
              y={PLOT_H + 42}
              fill="#8b949e"
              fontSize="12"
              fontFamily="-apple-system, sans-serif"
              textAnchor="middle"
            >
              surprise (bits/word)
            </text>
            <text
              x={-PLOT_H / 2}
              y={-50}
              fill="#8b949e"
              fontSize="12"
              fontFamily="-apple-system, sans-serif"
              textAnchor="middle"
              transform="rotate(-90)"
            >
              views (log scale)
            </text>

            {/* Trend line */}
            <line
              x1={scaleX(chart.trendX1)}
              y1={scaleY(chart.trendY1)}
              x2={scaleX(chart.trendX2)}
              y2={scaleY(chart.trendY2)}
              stroke="#58a6ff"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.5}
            />

            {/* Data points */}
            {chart.points.map((p) => {
              if (p.views <= 0) return null;
              const cx = scaleX(p.surprise);
              const cy = scaleY(p.views);
              const color = tagColor(p.tag);
              const dimmed =
                hoveredTag !== null && hoveredTag !== p.tag;

              return (
                <circle
                  key={p.id}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={color}
                  opacity={dimmed ? 0.15 : 0.7}
                  stroke={
                    tooltip?.point.id === p.id ? '#e6edf3' : 'none'
                  }
                  strokeWidth={tooltip?.point.id === p.id ? 1.5 : 0}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                  onMouseEnter={() => handleMouseEnter(p, cx, cy)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })}

            {/* Correlation label in top-right corner */}
            <text
              x={PLOT_W - 4}
              y={16}
              fill="#58a6ff"
              fontSize="13"
              fontFamily="'SF Mono', monospace"
              textAnchor="end"
              fontWeight="600"
            >
              r = {data.correlation.toFixed(3)}
            </text>
          </g>
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: `${((tooltip.x + MARGIN.left) / VIEWBOX_W) * 100}%`,
              top: `${((tooltip.y + MARGIN.top) / VIEWBOX_H) * 100}%`,
              transform: 'translate(-50%, -120%)',
              background: '#1c2128',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '8px 12px',
              pointerEvents: 'none',
              zIndex: 10,
              maxWidth: '280px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                fontFamily: "'SF Mono', monospace",
                color: '#e6edf3',
                marginBottom: '4px',
              }}
            >
              <span style={{ color: tagColor(tooltip.point.tag) }}>
                {tooltip.point.tag}
              </span>
              {': '}
              {tooltip.point.surprise.toFixed(2)} bits,{' '}
              {tooltip.point.views.toLocaleString()} views
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: '#8b949e',
                lineHeight: '1.3',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {tooltip.point.text_preview}
              {tooltip.point.text_preview.length >= 100 ? '...' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 16px',
          marginTop: '12px',
          fontSize: '0.75rem',
          fontFamily: "'SF Mono', monospace",
        }}
      >
        {legendTags.map(([tag, count]) => (
          <span
            key={tag}
            style={{
              color:
                hoveredTag === null || hoveredTag === tag
                  ? tagColor(tag)
                  : '#6e768140',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={() => setHoveredTag(tag)}
            onMouseLeave={() => setHoveredTag(null)}
          >
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: tagColor(tag),
                marginRight: '4px',
                opacity:
                  hoveredTag === null || hoveredTag === tag ? 0.8 : 0.2,
                transition: 'opacity 0.15s',
              }}
            />
            {tag} ({count})
          </span>
        ))}
      </div>
    </div>
  );
}
