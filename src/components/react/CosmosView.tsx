import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildCosmos,
  planetPosition,
  orbitPoint,
  filterCosmosByTimestamp,
} from '../../lib/cosmos-system';
import type {
  CosmosNode,
  CosmosLayout,
  Star,
  OrbitRing,
  Planet,
  CometArc,
} from '../../lib/cosmos-system';
import { TAG_COLORS } from '../../lib/colors';
import GardenTimeline from './GardenTimeline';
import TagLabels from './TagLabels';

// ─── Constants ───────────────────────────────────────────────────────────────

const BG_COLOR = '#050510';
const HOVER_RADIUS = 16;
const ORBIT_SEGMENTS = 64;       // segments per orbit ellipse for drawing
const AMBIENT_SPEED = 0.00008;   // radians per ms for ambient rotation
const STAR_PULSE_SPEED = 0.002;  // pulse frequency for star glow
const TWINKLE_SPEED = 0.004;     // twinkle frequency for small planets

// ─── Types ───────────────────────────────────────────────────────────────────

interface TooltipInfo {
  x: number;
  y: number;
  nodeId: string;
  tag: string;
  surprise: number;
  textPreview: string;
  timestamp: number;
  variety: string;
  wordCount: number;
  subTag: string;
}

interface TagInfo {
  tag: string;
  count: number;
  color: string;
}

// ─── Spatial Index ───────────────────────────────────────────────────────────

interface SpatialEntry {
  starIdx: number;
  orbitIdx: number;
  planetIdx: number;
}

function getVisibleCells(
  panX: number,
  panY: number,
  zoom: number,
  viewW: number,
  viewH: number,
  cellSize: number,
): { minCX: number; maxCX: number; minCY: number; maxCY: number } {
  const worldLeft = -panX / zoom;
  const worldTop = -panY / zoom;
  const worldRight = (viewW - panX) / zoom;
  const worldBottom = (viewH - panY) / zoom;

  return {
    minCX: worldLeft - cellSize,
    maxCX: worldRight + cellSize,
    minCY: worldTop - cellSize,
    maxCY: worldBottom + cellSize,
  };
}

function isStarVisible(
  star: Star,
  maxOrbitRadius: number,
  bounds: { minCX: number; maxCX: number; minCY: number; maxCY: number },
): boolean {
  return (
    star.x + maxOrbitRadius > bounds.minCX &&
    star.x - maxOrbitRadius < bounds.maxCX &&
    star.y + maxOrbitRadius > bounds.minCY &&
    star.y - maxOrbitRadius < bounds.maxCY
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CosmosViewProps {
  tags?: string[];
  title?: string;
  maxNodes?: number;
}

export default function CosmosView({ tags, title, maxNodes = 2000 }: CosmosViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagInfos, setTagInfos] = useState<TagInfo[]>([]);

  // Timeline state
  const [minTs, setMinTs] = useState(0);
  const [maxTs, setMaxTs] = useState(Date.now());
  const [currentTs, setCurrentTs] = useState(Date.now());
  const [totalCount, setTotalCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  // Interaction state
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // Pan/zoom state
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const sizeRef = useRef({ w: window.innerWidth, h: window.innerHeight });

  // Animation refs
  const rafRef = useRef<number>(0);
  const highlightRef = useRef<string | null>(null);
  const currentTsRef = useRef<number>(Date.now());
  const animStartRef = useRef<number>(0);

  // Cosmos data refs
  const cosmosRef = useRef<CosmosLayout | null>(null);
  const visibleCometsRef = useRef<CometArc[]>([]);

  // Fade-in tracking
  const fadeInRef = useRef(new Map<string, number>());

  // ─── Data Fetching ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const tagParam = tags ? `&tag=${tags.join(',')}` : '';
        const limitParam = `&limit=${maxNodes}`;
        const res = await fetch(`/api/garden-tree?${tagParam}${limitParam}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const nodes: CosmosNode[] = data.nodes || [];
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Build cosmos layout
        const cosmos = buildCosmos(nodes, w * 2, h * 2);
        cosmosRef.current = cosmos;

        // Tag info for labels
        const tagCounts = new Map<string, number>();
        for (const n of nodes) {
          const t = n.tag || 'reaction';
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        }
        const infos: TagInfo[] = [...tagCounts.entries()]
          .map(([tag, count]) => ({
            tag,
            count,
            color: TAG_COLORS[tag] || '#6e7681',
          }))
          .sort((a, b) => b.count - a.count);

        setTagInfos(infos);
        setTotalCount(nodes.length);
        setMinTs(data.dateRange.min);
        setMaxTs(data.dateRange.max);
        setCurrentTs(data.dateRange.min);
        currentTsRef.current = data.dateRange.min;

        // Center the view
        const allX = cosmos.stars.map(s => s.x);
        const allY = cosmos.stars.map(s => s.y);
        if (allX.length > 0) {
          const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
          const centerY = (Math.min(...allY) + Math.max(...allY)) / 2;
          const spread = Math.max(
            Math.max(...allX) - Math.min(...allX),
            Math.max(...allY) - Math.min(...allY),
          );
          const fitZoom = Math.min(w, h) / (spread + 400);
          const zoom = Math.max(0.2, Math.min(2, fitZoom));
          zoomRef.current = zoom;
          panRef.current = {
            x: w / 2 - centerX * zoom,
            y: h / 2 - centerY * zoom,
          };
        }

        animStartRef.current = performance.now();
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Cosmos fetch error:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // ─── Update refs on state changes ──────────────────────────────────────

  useEffect(() => {
    highlightRef.current = highlightedTag;
  }, [highlightedTag]);

  useEffect(() => {
    currentTsRef.current = currentTs;

    const cosmos = cosmosRef.current;
    if (!cosmos) return;

    const { visiblePlanets, filteredComets } = filterCosmosByTimestamp(
      cosmos.stars,
      cosmos.comets,
      currentTs,
    );
    visibleCometsRef.current = filteredComets;
    setVisibleCount(visiblePlanets);
  }, [currentTs]);

  // ─── Canvas Resize ────────────────────────────────────────────────────

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h };
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ─── Pan / Zoom Handlers ──────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.05, Math.min(15, zoomRef.current * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      panRef.current.x = cx - (cx - panRef.current.x) * (newZoom / zoomRef.current);
      panRef.current.y = cy - (cy - panRef.current.y) * (newZoom / zoomRef.current);
      zoomRef.current = newZoom;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
        canvas.style.cursor = 'grabbing';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current.dragging) {
        panRef.current.x += e.clientX - dragRef.current.lastX;
        panRef.current.y += e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
      } else {
        // Hover detection
        const cosmos = cosmosRef.current;
        if (!cosmos) return;

        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const my = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
        const now = performance.now();
        const elapsed = now - animStartRef.current;
        const animAngle = elapsed * AMBIENT_SPEED;

        let closest: Planet | null = null;
        let closestDist = HOVER_RADIUS / zoomRef.current;
        let closestStar: Star | null = null;
        let closestOrbit: OrbitRing | null = null;

        for (const star of cosmos.stars) {
          // Quick bounding check
          const maxR = star.orbits.length > 0
            ? star.orbits[star.orbits.length - 1].radiusA + 50
            : 100;
          const ddx = star.x - mx;
          const ddy = star.y - my;
          if (ddx * ddx + ddy * ddy > (maxR + closestDist) * (maxR + closestDist)) continue;

          for (const orbit of star.orbits) {
            for (const planet of orbit.planets) {
              if (planet.timestamp > currentTsRef.current) continue;
              const pos = planetPosition(star, orbit, planet, animAngle);
              const dx = pos.x - mx;
              const dy = pos.y - my;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < closestDist) {
                closest = planet;
                closestDist = dist;
                closestStar = star;
                closestOrbit = orbit;
              }
            }
          }
        }

        if (closest) {
          setTooltip({
            x: e.clientX,
            y: e.clientY,
            nodeId: closest.id,
            tag: closest.tag,
            surprise: closest.surprise,
            textPreview: closest.textPreview,
            timestamp: closest.timestamp,
            variety: closest.variety,
            wordCount: closest.wordCount,
            subTag: closest.subTag,
          });
          canvas.style.cursor = 'pointer';
        } else {
          setTooltip(null);
          canvas.style.cursor = 'grab';
        }
      }
    };

    const onMouseUp = () => {
      dragRef.current.dragging = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ─── Render Loop ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;
      const zoom = zoomRef.current;
      const pan = panRef.current;
      const highlight = highlightRef.current;
      const cosmos = cosmosRef.current;
      const currentTimestamp = currentTsRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w * dpr, h * dpr);

      // Background
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w * dpr, h * dpr);

      if (!cosmos) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Transform
      ctx.setTransform(
        dpr * zoom, 0, 0, dpr * zoom,
        dpr * pan.x, dpr * pan.y,
      );

      const elapsed = now - animStartRef.current;
      const animAngle = elapsed * AMBIENT_SPEED;

      // Viewport bounds for culling
      const bounds = getVisibleCells(pan.x, pan.y, zoom, w, h, 0);

      // ── Draw background stars (tiny dots for ambiance) ──
      ctx.save();
      const bgSeed = 777;
      for (let i = 0; i < 200; i++) {
        const bx = seededRandom(bgSeed + i * 3) * w * 3 - w * 0.5;
        const by = seededRandom(bgSeed + i * 3 + 1) * h * 3 - h * 0.5;
        const bSize = seededRandom(bgSeed + i * 3 + 2) * 1.2 + 0.3;
        const twinkle = 0.15 + 0.15 * Math.sin(now * 0.001 + i * 1.7);
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bx, by, bSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ── Draw comet arcs (quote posts between systems) ──
      const visibleComets = visibleCometsRef.current;
      if (visibleComets.length > 0 && visibleComets.length < 3000) {
        ctx.save();
        for (const comet of visibleComets) {
          const fromStar = cosmos.stars.find(s => s.tag === comet.fromStarTag);
          const toStar = cosmos.stars.find(s => s.tag === comet.toStarTag);
          if (!fromStar || !toStar) continue;

          const isHighlighted =
            highlight === null ||
            highlight === comet.fromStarTag ||
            highlight === comet.toStarTag;
          if (!isHighlighted) continue;

          // Draw comet trail as a gradient line
          const grad = ctx.createLinearGradient(
            fromStar.x, fromStar.y, toStar.x, toStar.y,
          );
          const fromColor = TAG_COLORS[comet.fromStarTag] || '#6e7681';
          const toColor = TAG_COLORS[comet.toStarTag] || '#6e7681';
          grad.addColorStop(0, fromColor);
          grad.addColorStop(1, toColor);

          ctx.globalAlpha = 0.04;
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 8]);
          ctx.beginPath();

          // Arc through midpoint with offset for visual curve
          const mx = (fromStar.x + toStar.x) / 2;
          const my = (fromStar.y + toStar.y) / 2;
          const dx = toStar.x - fromStar.x;
          const dy = toStar.y - fromStar.y;
          const perpX = -dy * 0.15;
          const perpY = dx * 0.15;

          ctx.moveTo(fromStar.x, fromStar.y);
          ctx.quadraticCurveTo(mx + perpX, my + perpY, toStar.x, toStar.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // ── Draw each solar system ──
      for (const star of cosmos.stars) {
        // Culling: skip stars entirely off-screen
        const maxR = star.orbits.length > 0
          ? star.orbits[star.orbits.length - 1].radiusA + 60
          : 100;
        if (!isStarVisible(star, maxR, bounds)) continue;

        const isSystemHighlighted = highlight === null || highlight === star.tag;
        const systemAlpha = isSystemHighlighted ? 1.0 : 0.08;

        // ── Draw orbital trails ──
        if (zoom > 0.15) {
          ctx.save();
          ctx.globalAlpha = systemAlpha * 0.04;
          ctx.strokeStyle = star.color;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 8]);

          for (const orbit of star.orbits) {
            // Check if any planet in this orbit is visible (within timeline)
            let hasVisible = false;
            for (const p of orbit.planets) {
              if (p.timestamp <= currentTimestamp) { hasVisible = true; break; }
            }
            if (!hasVisible) continue;

            ctx.beginPath();
            for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
              const theta = (i / ORBIT_SEGMENTS) * Math.PI * 2;
              const pt = orbitPoint(star, orbit, theta);
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.stroke();
          }

          ctx.setLineDash([]);
          ctx.restore();
        }

        // ── Draw star (center) ──
        ctx.save();
        const pulsePhase = Math.sin(now * STAR_PULSE_SPEED + star.tag.charCodeAt(0)) * 0.3 + 0.7;
        const starGlowRadius = star.radius * (2.5 + pulsePhase * 1.5);

        // Outer glow
        const glowGrad = ctx.createRadialGradient(
          star.x, star.y, star.radius * 0.5,
          star.x, star.y, starGlowRadius,
        );
        glowGrad.addColorStop(0, star.color);
        glowGrad.addColorStop(0.3, star.color + '66');
        glowGrad.addColorStop(0.7, star.color + '15');
        glowGrad.addColorStop(1, star.color + '00');

        ctx.globalAlpha = systemAlpha * 0.6 * pulsePhase;
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(star.x, star.y, starGlowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.globalAlpha = systemAlpha * 0.95;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright center point
        ctx.globalAlpha = systemAlpha * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // ── Draw star label ──
        if (zoom > 0.25) {
          ctx.save();
          ctx.globalAlpha = systemAlpha * 0.4;
          ctx.fillStyle = star.color;
          ctx.font = `600 ${Math.max(8, 10 / zoom)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(star.tag, star.x, star.y + star.radius + 14 / zoom);
          ctx.restore();
        }

        // ── Draw planets ──
        for (const orbit of star.orbits) {
          for (const planet of orbit.planets) {
            if (planet.timestamp > currentTimestamp) continue;

            const pos = planetPosition(star, orbit, planet, animAngle);

            // Skip if off-screen
            if (pos.x < bounds.minCX || pos.x > bounds.maxCX ||
                pos.y < bounds.minCY || pos.y > bounds.maxCY) continue;

            // Fade-in animation
            let fadeAlpha = fadeInRef.current.get(planet.id) ?? 0;
            if (fadeAlpha < 1) {
              fadeAlpha = Math.min(1, fadeAlpha + 0.03);
              fadeInRef.current.set(planet.id, fadeAlpha);
            }

            const planetAlpha = systemAlpha * fadeAlpha;
            if (planetAlpha < 0.01) continue;

            ctx.save();

            // Twinkling for small planets
            let twinkleAlpha = 1;
            if (planet.radius < 3.5) {
              const twinkleHash = planet.id.charCodeAt(0) * 31 + (planet.id.charCodeAt(1) || 0);
              twinkleAlpha = 0.6 + 0.4 * Math.sin(now * TWINKLE_SPEED + twinkleHash);
            }

            // ── Surprise glow (drawn behind planet) ──
            if (planet.surprise > 4 && isSystemHighlighted) {
              const glowIntensity = Math.min(1, (planet.surprise - 4) / 6);
              const glowR = planet.radius * (2 + glowIntensity * 2);
              const pGlow = ctx.createRadialGradient(
                pos.x, pos.y, planet.radius * 0.3,
                pos.x, pos.y, glowR,
              );
              pGlow.addColorStop(0, planet.color + 'aa');
              pGlow.addColorStop(0.5, planet.color + '33');
              pGlow.addColorStop(1, planet.color + '00');

              ctx.globalAlpha = planetAlpha * glowIntensity * 0.5 * twinkleAlpha;
              ctx.fillStyle = pGlow;
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
              ctx.fill();
            }

            // ── Saturn-like rings for high-engagement posts ──
            if (planet.hasRings && zoom > 0.4) {
              ctx.globalAlpha = planetAlpha * 0.2 * twinkleAlpha;
              ctx.strokeStyle = planet.color;
              ctx.lineWidth = 0.6;
              ctx.beginPath();
              ctx.ellipse(
                pos.x, pos.y,
                planet.radius * 2.5, planet.radius * 0.8,
                0.3, 0, Math.PI * 2,
              );
              ctx.stroke();
              // Second ring
              ctx.globalAlpha = planetAlpha * 0.12 * twinkleAlpha;
              ctx.beginPath();
              ctx.ellipse(
                pos.x, pos.y,
                planet.radius * 3.2, planet.radius * 1.0,
                0.3, 0, Math.PI * 2,
              );
              ctx.stroke();
            }

            // ── Planet body ──
            ctx.globalAlpha = planetAlpha * twinkleAlpha;
            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, planet.radius, 0, Math.PI * 2);
            ctx.fill();

            // ── Dark-side crescent (hemispheric shading) ──
            if (planet.radius > 2 && zoom > 0.5) {
              ctx.globalAlpha = planetAlpha * 0.35 * twinkleAlpha;
              ctx.fillStyle = '#000000';
              ctx.beginPath();
              // Shadow on right side
              ctx.arc(
                pos.x + planet.radius * 0.25,
                pos.y,
                planet.radius * 0.85,
                -Math.PI * 0.5,
                Math.PI * 0.5,
              );
              ctx.fill();
            }

            // ── Bright highlight dot ──
            if (planet.brightness > 0.5 && zoom > 0.6) {
              ctx.globalAlpha = planetAlpha * planet.brightness * 0.6 * twinkleAlpha;
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(
                pos.x - planet.radius * 0.3,
                pos.y - planet.radius * 0.3,
                planet.radius * 0.25,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }

            ctx.restore();
          }
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Reset fade-in when timeline scrubs backward
  const prevTsRef = useRef(currentTs);
  useEffect(() => {
    if (currentTs < prevTsRef.current) {
      fadeInRef.current.clear();
    }
    prevTsRef.current = currentTs;
  }, [currentTs]);

  // ─── Handlers ────────────────────────────────────────────────────────

  const handleTimelineChange = useCallback((ts: number) => {
    setCurrentTs(ts);
  }, []);

  const handleTagClick = useCallback((tag: string | null) => {
    setHighlightedTag(tag);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          cursor: 'grab',
        }}
      />

      {/* Header */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          right: 16,
          zIndex: 20,
          pointerEvents: 'none',
          textAlign: 'right',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.25)',
            fontWeight: 600,
          }}
        >
          {(title || 'THREADS COSMOS').toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.15)',
            marginTop: 2,
            letterSpacing: '0.1em',
          }}
        >
          @maybe_foucault
        </div>
      </div>

      {/* Timeline — reused from Garden */}
      {!loading && (
        <GardenTimeline
          minTimestamp={minTs}
          maxTimestamp={maxTs}
          currentTimestamp={currentTs}
          onChange={handleTimelineChange}
          visibleCount={visibleCount}
          totalCount={totalCount}
        />
      )}

      {/* Tag Labels — reused from Garden */}
      {!loading && tagInfos.length > 0 && (
        <TagLabels
          tags={tagInfos}
          highlightedTag={highlightedTag}
          onTagClick={handleTagClick}
        />
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: 'rgba(5, 5, 16, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            padding: '8px 12px',
            zIndex: 50,
            pointerEvents: 'none',
            maxWidth: 300,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: TAG_COLORS[tooltip.tag] || '#6e7681',
                boxShadow: `0 0 4px ${TAG_COLORS[tooltip.tag] || '#6e7681'}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: TAG_COLORS[tooltip.tag] || '#6e7681',
                fontWeight: 600,
              }}
            >
              {tooltip.tag}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              {tooltip.variety}
            </span>
          </div>

          {/* Sub-tag */}
          {tooltip.subTag && !tooltip.subTag.endsWith('__default__') && (
            <div
              style={{
                fontSize: 8,
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.25)',
                marginBottom: 4,
                letterSpacing: '0.05em',
              }}
            >
              {tooltip.subTag}
            </div>
          )}

          {tooltip.textPreview && (
            <div
              style={{
                fontSize: 10,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: 'rgba(255,255,255,0.65)',
                lineHeight: '1.4',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {tooltip.textPreview}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 4,
              fontSize: 8,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <span>
              {new Date(tooltip.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span>{tooltip.wordCount}w</span>
            {tooltip.surprise > 0 && (
              <span>{tooltip.surprise.toFixed(1)} bits</span>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            background: BG_COLOR,
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.15em',
            }}
          >
            {error ? `ERROR: ${error}` : 'FORMING COSMOS...'}
          </div>
        </div>
      )}
    </div>
  );
}

// Local seeded random (duplicated from cosmos-system to avoid import issues in render loop)
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
