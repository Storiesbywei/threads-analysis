import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  type ReactNode,
} from 'react';

/**
 * StationScroller — Horizontal scroll-snap container for station pages.
 *
 * All 12 stations are mounted simultaneously in a horizontal flex row.
 * On mobile, swiping left/right snaps to the next/previous station.
 * On desktop, overflow is hidden and navigation is driven by the rotary knob.
 *
 * NOTE: When real D3/WebGL content replaces the current stubs, consider
 * lazy-rendering off-screen stations (e.g., only mount currentIndex +/- 1)
 * to avoid performance issues with 12 heavy canvases mounted at once.
 */

export interface StationScrollerHandle {
  scrollToStation: (index: number, behavior?: ScrollBehavior) => void;
}

interface StationScrollerProps {
  children: ReactNode[];
  currentIndex: number;
  onStationChange: (index: number) => void;
}

export const StationScroller = forwardRef<StationScrollerHandle, StationScrollerProps>(
  function StationScroller({ children, currentIndex, onStationChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    // Guard against re-entrant scroll handling when we programmatically scroll
    const isExternalScroll = useRef(false);

    const scrollToStation = useCallback(
      (index: number, behavior: ScrollBehavior = 'smooth') => {
        const el = containerRef.current;
        if (!el) return;
        isExternalScroll.current = true;
        el.scrollTo({ left: index * el.clientWidth, behavior });
      },
      [],
    );

    useImperativeHandle(ref, () => ({ scrollToStation }), [scrollToStation]);

    // When currentIndex changes externally (rotary knob, URL, back button),
    // scroll to that station — but only if we're not already there.
    // Without this guard, a user swipe → URL update → useEffect loop
    // sets isExternalScroll=true on a no-op scrollTo, and the NEXT
    // user swipe's scrollend gets eaten by the guard (off-by-one bug).
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w > 0 && Math.round(el.scrollLeft / w) === currentIndex) return;
      scrollToStation(currentIndex);
    }, [currentIndex, scrollToStation]);

    // Initial load: jump to the correct station without animation.
    useEffect(() => {
      scrollToStation(currentIndex, 'instant');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Detect which station is visible after a scroll completes.
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const handleScrollEnd = () => {
        // If this scroll was triggered programmatically, just reset the guard.
        if (isExternalScroll.current) {
          isExternalScroll.current = false;
          return;
        }

        const width = el.clientWidth;
        if (width === 0) return;
        const index = Math.round(el.scrollLeft / width);
        onStationChange(index);
      };

      el.addEventListener('scrollend', handleScrollEnd);
      return () => el.removeEventListener('scrollend', handleScrollEnd);
    }, [onStationChange]);

    return (
      <div ref={containerRef} className="station-scroller">
        {children.map((child, i) => (
          <div key={i} className="station-panel">
            {child}
          </div>
        ))}
      </div>
    );
  },
);
