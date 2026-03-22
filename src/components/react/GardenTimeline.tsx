import { useCallback, useEffect, useRef, useState } from 'react';

interface GardenTimelineProps {
  minTimestamp: number;
  maxTimestamp: number;
  currentTimestamp: number;
  onChange: (ts: number) => void;
  visibleCount: number;
  totalCount: number;
}

export default function GardenTimeline({
  minTimestamp,
  maxTimestamp,
  currentTimestamp,
  onChange,
  visibleCount,
  totalCount,
}: GardenTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const tsRef = useRef(currentTimestamp);

  const range = maxTimestamp - minTimestamp;
  const progress = range > 0 ? (currentTimestamp - minTimestamp) / range : 1;

  // Keep ref in sync
  useEffect(() => {
    tsRef.current = currentTimestamp;
  }, [currentTimestamp]);

  const formatDate = useCallback((ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, []);

  const formatDateFull = useCallback((ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Auto-play logic
  useEffect(() => {
    playRef.current = isPlaying;
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    // If at end, restart
    if (tsRef.current >= maxTimestamp) {
      onChange(minTimestamp);
      tsRef.current = minTimestamp;
    }

    const tick = (now: number) => {
      if (!playRef.current) return;
      if (lastTickRef.current === 0) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      // 60 seconds for full playthrough
      const speed = range / 60000;
      const next = Math.min(maxTimestamp, tsRef.current + speed * dt);
      tsRef.current = next;
      onChange(next);

      if (next >= maxTimestamp) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, minTimestamp, maxTimestamp, range, onChange]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const ts = minTimestamp + (val / 1000) * range;
    tsRef.current = ts;
    onChange(ts);
  };

  const togglePlay = () => setIsPlaying(p => !p);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 12,
        zIndex: 20,
        background:
          'linear-gradient(to bottom, rgba(13,13,14,0.95) 0%, rgba(13,13,14,0) 100%)',
      }}
    >
      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        style={{
          background: 'none',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 4,
          color: '#e6edf3',
          cursor: 'pointer',
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: 'monospace',
          letterSpacing: '0.05em',
          opacity: 0.7,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>

      {/* Start date */}
      <span
        style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.35)',
          minWidth: 60,
          textAlign: 'right',
        }}
      >
        {formatDate(minTimestamp)}
      </span>

      {/* Slider */}
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={handleSliderChange}
          style={{
            width: '100%',
            height: 2,
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, rgba(126,183,127,0.5) ${progress * 100}%, rgba(255,255,255,0.08) ${progress * 100}%)`,
            borderRadius: 1,
            outline: 'none',
            cursor: 'pointer',
          }}
        />
        {/* Date label above thumb */}
        <div
          style={{
            position: 'absolute',
            top: -16,
            left: `${progress * 100}%`,
            transform: 'translateX(-50%)',
            fontSize: 9,
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.5)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {formatDateFull(currentTimestamp)}
        </div>
      </div>

      {/* End date */}
      <span
        style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.35)',
          minWidth: 60,
        }}
      >
        {formatDate(maxTimestamp)}
      </span>

      {/* Post counter */}
      <span
        style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.25)',
          minWidth: 80,
          textAlign: 'right',
          letterSpacing: '0.05em',
        }}
      >
        {visibleCount.toLocaleString()}/{totalCount.toLocaleString()}
      </span>
    </div>
  );
}
