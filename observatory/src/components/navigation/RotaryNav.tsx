import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { STATIONS, getStationIndex } from '@/lib/stations';
import { cn } from '@/lib/utils';

const STATION_COUNT = STATIONS.length;
const ANGLE_STEP = 360 / STATION_COUNT; // 30 degrees per station

export function RotaryNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const knobRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startAngle = useRef(0);
  const currentAngle = useRef(0);
  const velocityHistory = useRef<number[]>([]);
  const lastAngle = useRef(0);
  const lastTime = useRef(0);
  const animFrame = useRef(0);

  // Derive current station from URL
  const currentIndex = Math.max(0, getStationIndex(location.pathname));
  const targetAngle = currentIndex * ANGLE_STEP;

  const [displayAngle, setDisplayAngle] = useState(targetAngle);

  // Sync angle when URL changes (back/forward buttons)
  useEffect(() => {
    currentAngle.current = targetAngle;
    setDisplayAngle(targetAngle);
  }, [targetAngle]);

  const getCenterPoint = useCallback(() => {
    if (!knobRef.current) return { x: 0, y: 0 };
    const rect = knobRef.current.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const getAngleFromEvent = useCallback((e: PointerEvent) => {
    const center = getCenterPoint();
    return Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
  }, [getCenterPoint]);

  const snapToNearest = useCallback((angle: number) => {
    const normalized = ((angle % 360) + 360) % 360;
    const snapped = Math.round(normalized / ANGLE_STEP) * ANGLE_STEP;
    const stationIndex = (snapped / ANGLE_STEP) % STATION_COUNT;
    const station = STATIONS[stationIndex]!;
    currentAngle.current = snapped;
    setDisplayAngle(snapped);
    navigate(station.path);
  }, [navigate]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    startAngle.current = getAngleFromEvent(e.nativeEvent) - currentAngle.current;
    velocityHistory.current = [];
    lastAngle.current = currentAngle.current;
    lastTime.current = Date.now();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getAngleFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const angle = getAngleFromEvent(e.nativeEvent) - startAngle.current;
    currentAngle.current = angle;
    setDisplayAngle(angle);

    // Track velocity
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      const velocity = (angle - lastAngle.current) / dt;
      velocityHistory.current.push(velocity);
      if (velocityHistory.current.length > 5) velocityHistory.current.shift();
    }
    lastAngle.current = angle;
    lastTime.current = now;
  }, [getAngleFromEvent]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;

    // Calculate average velocity
    const vels = velocityHistory.current;
    const avgVelocity = vels.length > 0 ? vels.reduce((a, b) => a + b, 0) / vels.length : 0;

    if (Math.abs(avgVelocity) > 0.1) {
      // Apply momentum
      let vel = avgVelocity * 200;
      let angle = currentAngle.current;

      const decelerate = () => {
        vel *= 0.92;
        angle += vel * 0.016;
        currentAngle.current = angle;
        setDisplayAngle(angle);

        if (Math.abs(vel) > 2) {
          animFrame.current = requestAnimationFrame(decelerate);
        } else {
          snapToNearest(angle);
        }
      };
      animFrame.current = requestAnimationFrame(decelerate);
    } else {
      snapToNearest(currentAngle.current);
    }
  }, [snapToNearest]);

  // Cleanup animation frame
  useEffect(() => {
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  // Click on tick to navigate directly
  const handleTickClick = (index: number) => {
    const angle = index * ANGLE_STEP;
    currentAngle.current = angle;
    setDisplayAngle(angle);
    navigate(STATIONS[index]!.path);
  };

  return (
    <div className="flex items-center justify-between">
      {/* Branding */}
      <div className="font-mono text-ink text-sm tracking-wide">
        <span className="font-bold">threads</span>
        <br />
        <span className="text-[10px] text-ink-muted tracking-[0.2em]">observatory</span>
      </div>

      {/* Knob assembly */}
      <div className="select-none relative w-[140px] h-[140px]">
        {/* Tick marks and labels */}
        {STATIONS.map((station, i) => {
          const angle = i * ANGLE_STEP - 90; // -90 to start from top
          const rad = (angle * Math.PI) / 180;
          const outerR = 66;
          const innerR = 56;
          const isActive = i === currentIndex;

          return (
            <div key={station.id}>
              {/* Tick mark */}
              <div
                className="absolute"
                style={{
                  left: `${70 + Math.cos(rad) * innerR}px`,
                  top: `${70 + Math.sin(rad) * innerR}px`,
                  width: '2px',
                  height: `${outerR - innerR}px`,
                  background: isActive ? '#FF5500' : '#D5D0C8',
                  transform: `rotate(${angle + 90}deg)`,
                  transformOrigin: 'top center',
                  boxShadow: isActive ? '0 0 6px rgba(255,85,0,0.4)' : 'none',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                }}
                onClick={() => handleTickClick(i)}
              />
            </div>
          );
        })}

        {/* Knob */}
        <div
          ref={knobRef}
          className={cn(
            'absolute top-1/2 left-1/2 w-20 h-20 -mt-10 -ml-10 rounded-full cursor-grab active:cursor-grabbing',
            'transition-shadow duration-300'
          )}
          style={{
            background: 'radial-gradient(circle at 35% 35%, #ffffff, #c8c8c8)',
            boxShadow: 'var(--shadow-knob)',
            transform: `rotate(${displayAngle}deg)`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Pointer indicator */}
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-4 rounded-full"
            style={{ background: 'rgba(26,26,24,0.4)' }}
          />
        </div>

        {/* Center dot */}
        <div
          className="absolute top-1/2 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full pointer-events-none"
          style={{ background: '#E6E2DA', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}
        />
      </div>

      {/* Current station label below knob */}
      <div className="text-center mt-2">
        <div className="text-[10px] text-ink-muted font-mono tracking-wider">
          {STATIONS[currentIndex]?.number} / {String(STATION_COUNT).padStart(2, '0')}
        </div>
      </div>

      {/* Tick mark dots — right side decoration */}
      <div className="flex items-center gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full"
            style={{ background: i === currentIndex ? '#FF5500' : '#C5C3BE' }}
          />
        ))}
      </div>
    </div>
  );
}
