import { type ReactNode, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────
export interface SK4ReaderProps {
  // Lid status bar
  lidLabel?: string;
  lidValue?: string;
  lidMeta?: string;
  lidDate?: string;
  isActive?: boolean;

  // Vinyl disc
  discTitle?: string;
  discSubtitle?: string;
  discColor?: string;
  spinning?: boolean;

  // Content panel
  content: ReactNode;
  meta?: string;

  // Frequency bars
  bars?: Array<{ label: string; value: number; maxValue: number; color?: string }>;
  barsTitle?: string;

  // Navigation
  onPrev?: () => void;
  onNext?: () => void;
  onRandom?: () => void;
  onEject?: () => void;
  onOpen?: () => void;

  // Nav dots
  totalItems?: number;
  currentIndex?: number;
  onDotClick?: (index: number) => void;
}

// ── Component ──────────────────────────────────────────────────
export default function SK4Reader({
  lidLabel = "Now reading",
  lidValue,
  lidMeta,
  lidDate,
  isActive = true,
  discTitle,
  discSubtitle,
  discColor = "#CC3322",
  spinning = false,
  content,
  meta,
  bars,
  barsTitle = "Tag frequency",
  onPrev,
  onNext,
  onRandom,
  onEject,
  onOpen,
  totalItems = 0,
  currentIndex = 0,
  onDotClick,
}: SK4ReaderProps) {
  const tonearmDeg = useMemo(() => {
    if (totalItems <= 1) return -45;
    return -45 + (currentIndex / Math.max(totalItems - 1, 1)) * 50;
  }, [currentIndex, totalItems]);

  // Limit visible dots to avoid overflow (show max ~20)
  const maxDots = 20;
  const showDots = totalItems <= maxDots;

  return (
    <>
      <style>{SK4_CSS}</style>
      <div className="sk4">
        {/* ── Lid ── */}
        <div className="sk4-lid">
          {isActive && <div className="sk4-lid-dot" />}
          <div className="sk4-lid-label">{lidLabel}</div>
          {lidValue && <div className="sk4-lid-val">{lidValue}</div>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
            {lidMeta && <div className="sk4-lid-val">{lidMeta}</div>}
            {lidDate && <div className="sk4-lid-val">{lidDate}</div>}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="sk4-body">
          {/* ── Platter zone ── */}
          <div className="sk4-platter-zone">
            <div className={`sk4-record${spinning ? " spinning" : ""}`}>
              <div className="sk4-grooves" />
              <div className="sk4-label-disc" style={{ background: discColor }}>
                <div className="sk4-label-title">
                  {discTitle
                    ? discTitle.length > 18
                      ? discTitle.slice(0, 18) + "\u2026"
                      : discTitle
                    : "\u2014"}
                </div>
                {discSubtitle && (
                  <div className="sk4-label-sub">{discSubtitle}</div>
                )}
              </div>
            </div>

            {/* Tonearm */}
            <div className="sk4-tonearm-wrap">
              <div className="sk4-tonearm-pivot" />
              <div
                className="sk4-tonearm-arm"
                style={{ transform: `rotate(${tonearmDeg}deg)` }}
              >
                <div className="sk4-tonearm-head" />
              </div>
            </div>

            {/* Nav dots */}
            {showDots && totalItems > 0 && (
              <div className="sk4-nav-dots">
                {Array.from({ length: totalItems }, (_, i) => (
                  <div
                    key={i}
                    className={`sk4-dot${i === currentIndex ? " active" : ""}`}
                    onClick={() => onDotClick?.(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Controls zone ── */}
          <div className="sk4-controls-zone">
            {/* Content panel */}
            <div className="sk4-post-panel">
              <div className="sk4-post-text">{content}</div>
              {meta && (
                <div className="sk4-post-meta" style={{ marginTop: 6 }}>
                  {meta}
                </div>
              )}
            </div>

            {/* Frequency bars */}
            {bars && bars.length > 0 && (
              <div className="sk4-scale-strip">
                <div
                  style={{
                    fontSize: 7,
                    color: "#888",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                    textTransform: "uppercase" as const,
                  }}
                >
                  {barsTitle}
                </div>
                {bars.map((b) => {
                  const pct = b.maxValue > 0 ? Math.round((b.value / b.maxValue) * 100) : 0;
                  return (
                    <div className="sk4-scale-row" key={b.label}>
                      <span className="sk4-scale-row-label">{b.label}</span>
                      <div
                        className="sk4-scale-row-bar"
                        style={{
                          width: `${pct}%`,
                          background: b.color ?? "#1A1A18",
                        }}
                      />
                      <span style={{ fontSize: 7, color: "#888", marginLeft: 4 }}>
                        {b.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Knobs + buttons */}
            <div className="sk4-knob-row">
              {onPrev && (
                <div className="sk4-knob-group">
                  <div className="sk4-knob" onClick={onPrev} title="Previous" />
                  <div className="sk4-knob-lbl">prev</div>
                </div>
              )}
              {onNext && (
                <div className="sk4-knob-group">
                  <div className="sk4-knob" onClick={onNext} title="Next" />
                  <div className="sk4-knob-lbl">next</div>
                </div>
              )}
              {onRandom && (
                <div className="sk4-knob-group">
                  <div className="sk4-knob" onClick={onRandom} title="Random" />
                  <div className="sk4-knob-lbl">rand</div>
                </div>
              )}
              <div className="sk4-btns" style={{ marginLeft: "auto" }}>
                {onEject && (
                  <div className="sk4-btn red" onClick={onEject}>
                    eject
                  </div>
                )}
                {onOpen && (
                  <div className="sk4-btn" onClick={onOpen}>
                    open &#8599;
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Scoped CSS (injected once) ─────────────────────────────────
const SK4_CSS = `
/* ── SK4 Record Player ── */
.sk4 {
  width: 100%;
  background: #F0ECE4;
  border-radius: 3px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sk4-lid {
  height: 22px;
  background: rgba(200,220,230,0.35);
  border-bottom: 1px solid rgba(0,0,0,0.07);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
}
.sk4-lid-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #888;
}
.sk4-lid-val {
  font-size: 8px;
  letter-spacing: 0.08em;
  color: #444;
  font-family: 'Courier New', monospace;
}
.sk4-lid-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #3A6B3A;
  box-shadow: 0 0 4px rgba(58,107,58,0.6);
}

.sk4-body {
  flex: 1;
  display: flex;
  min-height: 260px;
}

.sk4-platter-zone {
  flex: 0 0 52%;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: #F0ECE4;
}

.sk4-record {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: #1A1A18;
  box-shadow: 0 6px 24px rgba(0,0,0,0.35), inset 0 0 40px rgba(0,0,0,0.5);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.6s;
}
.sk4-record.spinning {
  animation: sk4-spin 4s linear infinite;
}
@keyframes sk4-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.sk4-grooves {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: repeating-radial-gradient(
    circle,
    transparent 0,
    transparent 6px,
    rgba(255,255,255,0.03) 6px,
    rgba(255,255,255,0.03) 7px
  );
}

.sk4-label-disc {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: #CC3322;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  padding: 8px;
  text-align: center;
}
.sk4-label-title {
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.9);
  line-height: 1.3;
  word-break: break-word;
}
.sk4-label-sub {
  font-size: 6px;
  color: rgba(255,255,255,0.6);
  margin-top: 2px;
  letter-spacing: 0.06em;
}

.sk4-tonearm-wrap {
  position: absolute;
  right: 28px;
  top: 18px;
}
.sk4-tonearm-pivot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #888;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  position: relative;
  z-index: 2;
}
.sk4-tonearm-arm {
  width: 80px;
  height: 2.5px;
  background: #999;
  border-radius: 2px;
  transform-origin: left center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  position: absolute;
  top: 4px;
  left: 10px;
  transition: transform 0.8s cubic-bezier(0.34,1.2,0.64,1);
}
.sk4-tonearm-head {
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: #777;
  position: absolute;
  right: -4px;
  top: -3px;
}

.sk4-nav-dots {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}
.sk4-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(0,0,0,0.15);
  cursor: pointer;
  transition: all 0.2s;
}
.sk4-dot.active {
  background: #1A1A18;
  transform: scale(1.3);
}

.sk4-controls-zone {
  flex: 1;
  border-left: 1px solid rgba(0,0,0,0.07);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #ECEAE2;
}

.sk4-post-panel {
  background: #F8F4EC;
  border-radius: 2px;
  padding: 10px 12px;
  border: 0.5px solid rgba(0,0,0,0.08);
  flex: 1;
}
.sk4-post-text {
  font-size: 12px;
  line-height: 1.65;
  color: #1A1A18;
  flex: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}
.sk4-post-meta {
  font-size: 10px;
  color: #888;
  letter-spacing: 0.04em;
}

.sk4-scale-strip {
  background: #F8F4EC;
  border-radius: 2px;
  padding: 8px 10px;
  border: 0.5px solid rgba(0,0,0,0.08);
  font-size: 7px;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.06em;
  color: #555;
  line-height: 1.8;
}
.sk4-scale-strip .sk4-scale-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.sk4-scale-row-bar {
  height: 3px;
  background: #1A1A18;
  border-radius: 1px;
  transition: width 0.4s;
}
.sk4-scale-row-label {
  width: 60px;
  flex-shrink: 0;
  color: #888;
}

.sk4-knob-row {
  display: flex;
  gap: 14px;
  align-items: flex-end;
}
.sk4-knob {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(145deg, #C8C4BC, #A8A4A0);
  box-shadow: 0 2px 5px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35);
  position: relative;
  cursor: pointer;
  transition: transform 0.2s;
}
.sk4-knob::after {
  content: '';
  position: absolute;
  top: 14%;
  left: 50%;
  transform: translateX(-50%);
  width: 1.5px;
  height: 28%;
  background: #4A4A48;
  border-radius: 1px;
}
.sk4-knob:hover {
  transform: rotate(20deg);
}
.sk4-knob-lbl {
  font-size: 7px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #888;
  text-align: center;
  margin-top: 3px;
}
.sk4-knob-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sk4-btns {
  display: flex;
  gap: 6px;
}
.sk4-btn {
  flex: 1;
  padding: 5px;
  border-radius: 2px;
  background: transparent;
  border: 0.5px solid rgba(0,0,0,0.15);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  color: #666;
  font-family: 'Space Grotesk', sans-serif;
  transition: all 0.15s;
  text-align: center;
}
.sk4-btn:hover {
  background: rgba(0,0,0,0.05);
  color: #1A1A18;
}
.sk4-btn.red {
  border-color: #CC3322;
  color: #CC3322;
}
`;
