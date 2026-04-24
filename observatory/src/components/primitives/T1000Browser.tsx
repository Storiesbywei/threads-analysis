import { useRef, useCallback } from "react";

/* ── Types ── */
export interface T1000Item {
  id: string;
  label: string;
  count?: number;
  color?: string;
}

export interface T1000Row {
  id: string;
  text: string;
  meta?: string;
  value?: string;
  isActive?: boolean;
}

export interface T1000BrowserProps {
  /** Left sidebar items */
  items: T1000Item[];
  activeItemId: string;
  onItemSelect: (id: string) => void;

  /** Right panel data rows */
  rows: T1000Row[];
  onRowClick?: (id: string) => void;

  /** Header */
  headerLabel?: string;
  headerTag?: string;
  headerCount?: string;

  /** Sort controls */
  sortOptions?: string[];
  activeSort?: string;
  onSortChange?: (sort: string) => void;

  /** Optional */
  compact?: boolean;
  onCompactToggle?: () => void;
  height?: number;
}

/* ── Inline style objects (Braun T1000 values that don't map to Tailwind) ── */

const S = {
  container: (h: number): React.CSSProperties => ({
    width: "100%",
    background: "#222220",
    borderRadius: 3,
    boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)",
    overflow: "hidden",
    display: "flex",
    height: h,
  }),

  left: {
    flex: "0 0 36%",
    background:
      "radial-gradient(circle, rgba(0,0,0,0.55) 1.2px, transparent 1.2px) #9E9A92",
    backgroundSize: "7px 7px",
    boxShadow: "inset 0 0 24px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    position: "relative" as const,
  },

  stationList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "10px 0",
    scrollbarWidth: "none" as const,
  },

  station: (active: boolean): React.CSSProperties => ({
    padding: "7px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderLeft: `3px solid ${active ? "#CC2418" : "transparent"}`,
    transition: "all 0.15s",
    background: active ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0)",
  }),

  stNum: (active: boolean): React.CSSProperties => ({
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: active ? "#CC2418" : "#888",
    width: 16,
    flexShrink: 0,
    fontFamily: "'Courier New', monospace",
  }),

  stName: (active: boolean): React.CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: active ? "#fff" : "#bbb",
    flex: 1,
  }),

  stCount: {
    fontSize: 9,
    color: "#666",
    fontFamily: "'Courier New', monospace",
  } as React.CSSProperties,

  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    background: "#1E1E1C",
  },

  headerBand: {
    height: 22,
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    borderBottom: "1px solid rgba(0,0,0,0.12)",
    background: "#EDEAE0",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#666",
  } as React.CSSProperties,

  scaleWindow: {
    flex: 1,
    overflow: "hidden",
    background: "#F2EEE2",
    borderBottom: "1px solid #111",
    position: "relative" as const,
  },

  scaleInner: {
    height: "100%",
    overflowY: "auto" as const,
    padding: "4px 0",
    scrollbarWidth: "thin" as const,
    scrollbarColor: "#888 transparent",
  } as React.CSSProperties,

  dataRow: (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "7px 14px",
    borderBottom: "0.5px solid rgba(0,0,0,0.08)",
    cursor: "pointer",
    transition: "background 0.1s",
    background: active ? "rgba(204,36,24,0.07)" : undefined,
    borderLeft: active ? "2px solid #CC2418" : undefined,
  }),

  rowIdx: {
    fontSize: 8,
    color: "#aaa",
    width: 18,
    flexShrink: 0,
    fontFamily: "'Courier New', monospace",
    marginTop: 2,
  } as React.CSSProperties,

  rowText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 1.5,
    color: "#1A1A18",
  } as React.CSSProperties,

  rowMeta: {
    fontSize: 8,
    color: "#888",
    whiteSpace: "nowrap" as const,
    fontFamily: "'Courier New', monospace",
    textAlign: "right" as const,
    flexShrink: 0,
    marginTop: 2,
  } as React.CSSProperties,

  controls: {
    flex: "0 0 60px",
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    gap: 12,
    borderTop: "1px solid #111",
    background: "#1E1E1C",
  } as React.CSSProperties,

  knob: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#3A3A38",
    boxShadow:
      "0 2px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)",
    position: "relative" as const,
    cursor: "pointer",
    flexShrink: 0,
    transition: "transform 0.2s",
  } as React.CSSProperties,

  knobNotch: {
    content: '""',
    position: "absolute" as const,
    top: "14%",
    left: "50%",
    transform: "translateX(-50%)",
    width: 2,
    height: "28%",
    background: "#888",
    borderRadius: 1,
  } as React.CSSProperties,

  knobLabel: {
    fontSize: 7,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#555",
    textAlign: "center" as const,
    marginTop: 2,
  } as React.CSSProperties,

  sep: {
    width: 1,
    height: 32,
    background: "#333",
    flexShrink: 0,
  } as React.CSSProperties,

  sortLabel: (active: boolean): React.CSSProperties => ({
    fontSize: 8,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: active ? "#D4B018" : "#666",
    padding: "3px 8px",
    border: `0.5px solid ${active ? "#D4B018" : "#333"}`,
    borderRadius: 2,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  }),

  fmBtn: {
    width: 18,
    height: 18,
    borderRadius: 2,
    background: "#CC2418",
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 6,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "rgba(255,255,255,0.9)",
  } as React.CSSProperties,
} as const;

/* ── Knob sub-component ── */
function Knob({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={S.knob}
        onClick={onClick}
        title={title}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "rotate(15deg)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "rotate(0deg)";
        }}
      >
        <div style={S.knobNotch} />
      </div>
      <div style={S.knobLabel}>{label}</div>
    </div>
  );
}

/* ── Main Component ── */
export function T1000Browser({
  items,
  activeItemId,
  onItemSelect,
  rows,
  onRowClick,
  headerLabel,
  headerTag,
  headerCount,
  sortOptions,
  activeSort,
  onSortChange,
  compact,
  onCompactToggle,
  height = 320,
}: T1000BrowserProps) {
  const stationListRef = useRef<HTMLDivElement>(null);

  const activeItem = items.find((it) => it.id === activeItemId);
  const tagColor = activeItem?.color ?? "#CC2418";

  const handleStationClick = useCallback(
    (id: string) => {
      onItemSelect(id);
    },
    [onItemSelect],
  );

  const cycleSortMode = useCallback(() => {
    if (!sortOptions?.length || !onSortChange) return;
    const idx = sortOptions.indexOf(activeSort ?? "");
    onSortChange(sortOptions[(idx + 1) % sortOptions.length]!);
  }, [sortOptions, activeSort, onSortChange]);

  return (
    <div style={S.container(height)}>
      {/* ── Left: station list ── */}
      <div style={S.left}>
        <div ref={stationListRef} style={S.stationList}>
          {items.map((item, i) => {
            const active = item.id === activeItemId;
            return (
              <div
                key={item.id}
                style={S.station(active)}
                onClick={() => handleStationClick(item.id)}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLDivElement).style.background =
                      "rgba(0,0,0,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = active
                    ? "rgba(0,0,0,0.3)"
                    : "rgba(0,0,0,0)";
                }}
              >
                <span style={S.stNum(active)}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={S.stName(active)}>{item.label}</span>
                {item.count != null && (
                  <span style={S.stCount}>{fmtCount(item.count)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: header + data rows + controls ── */}
      <div style={S.right}>
        {/* Header band */}
        <div style={S.headerBand}>
          {headerTag && (
            <span style={{ color: tagColor, marginRight: 8 }}>{headerTag}</span>
          )}
          <span>{headerLabel ?? activeItem?.label ?? ""}</span>
          {headerCount && (
            <span style={{ marginLeft: "auto", color: "#888", fontSize: 7 }}>
              {headerCount}
            </span>
          )}
        </div>

        {/* Scale window */}
        <div style={S.scaleWindow}>
          <div style={S.scaleInner}>
            {rows.map((row, i) => (
              <div
                key={row.id}
                style={S.dataRow(!!row.isActive)}
                onClick={() => onRowClick?.(row.id)}
                onMouseEnter={(e) => {
                  if (!row.isActive)
                    (e.currentTarget as HTMLDivElement).style.background =
                      "rgba(0,0,0,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    row.isActive ? "rgba(204,36,24,0.07)" : "";
                }}
              >
                <span style={S.rowIdx}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={S.rowText}>
                  {compact
                    ? row.text.slice(0, 80) + (row.text.length > 80 ? "..." : "")
                    : row.text.slice(0, 160) +
                      (row.text.length > 160 ? "..." : "")}
                </span>
                <span style={S.rowMeta}>
                  {row.value && (
                    <span style={{ color: "#1A1A18", fontWeight: 700 }}>
                      {row.value}
                    </span>
                  )}
                  {row.value && row.meta && <br />}
                  {row.meta}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Controls strip */}
        <div style={S.controls}>
          <Knob label="sort" onClick={cycleSortMode} title="Cycle sort mode" />
          <div style={S.sep} />
          <Knob
            label="density"
            onClick={onCompactToggle}
            title="Toggle compact"
          />
          <div style={S.sep} />

          {/* Sort labels */}
          {sortOptions && sortOptions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sortOptions.map((opt) => (
                <span
                  key={opt}
                  style={S.sortLabel(opt === activeSort)}
                  onClick={() => onSortChange?.(opt)}
                >
                  {opt}
                </span>
              ))}
            </div>
          )}

          {/* Right-side: FM button + page knob */}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            {onCompactToggle && (
              <div style={S.fmBtn} onClick={onCompactToggle} title="Toggle compact/expanded">
                {"\u2261"}
              </div>
            )}
            <Knob label="page" title="Page" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function fmtCount(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);
}

export default T1000Browser;
