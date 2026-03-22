import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildRadialGarden,
  filterGardenByTimestamp,
} from '../../lib/threads-lsystem';
import type {
  GardenNode,
  GardenBranch,
  QuoteEdge,
  TreeCenter,
} from '../../lib/threads-lsystem';
import { TAG_COLORS } from '../../lib/colors';
import GardenTimeline from './GardenTimeline';
import TagLabels from './TagLabels';

// ─── Constants ───────────────────────────────────────────────────────────────

const BG_COLOR = '#0D0D0E';
const HOVER_RADIUS = 14;
const LEAF_RADIUS = 1.8;
const BLOOM_FRAMES = 15;
const SPATIAL_CELL_SIZE = 300; // Radial layout is more evenly distributed

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
}

interface TagInfo {
  tag: string;
  count: number;
  color: string;
}

// ─── Spatial Index for culling ───────────────────────────────────────────────

interface SpatialCell {
  branches: number[]; // indices into the branches array
}

function buildSpatialIndex(
  branches: GardenBranch[],
  cellSize: number,
): Map<string, SpatialCell> {
  const grid = new Map<string, SpatialCell>();

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    // Use midpoint of branch for cell assignment
    const mx = (b.from.x + b.to.x) / 2;
    const my = (b.from.y + b.to.y) / 2;
    const cx = Math.floor(mx / cellSize);
    const cy = Math.floor(my / cellSize);
    const key = `${cx},${cy}`;

    if (!grid.has(key)) grid.set(key, { branches: [] });
    grid.get(key)!.branches.push(i);
  }

  return grid;
}

function getVisibleCells(
  panX: number,
  panY: number,
  zoom: number,
  viewW: number,
  viewH: number,
  cellSize: number,
): Set<string> {
  const cells = new Set<string>();

  // Compute world-space bounds of the visible viewport
  const worldLeft = -panX / zoom;
  const worldTop = -panY / zoom;
  const worldRight = (viewW - panX) / zoom;
  const worldBottom = (viewH - panY) / zoom;

  const minCX = Math.floor(worldLeft / cellSize) - 1;
  const maxCX = Math.floor(worldRight / cellSize) + 1;
  const minCY = Math.floor(worldTop / cellSize) - 1;
  const maxCY = Math.floor(worldBottom / cellSize) + 1;

  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      cells.add(`${cx},${cy}`);
    }
  }

  return cells;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ThreadsGardenProps {
  tags?: string[];       // filter to specific tags (e.g., ['philosophy', 'tech'])
  title?: string;        // page title
  maxNodes?: number;      // cap nodes for performance (default 2000)
}

export default function ThreadsGarden({ tags, title, maxNodes = 2000 }: ThreadsGardenProps) {
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

  // Garden data refs (never stored in state to avoid re-renders)
  const allBranchesRef = useRef<GardenBranch[]>([]);
  const allQuoteEdgesRef = useRef<QuoteEdge[]>([]);
  const centersRef = useRef<TreeCenter[]>([]);
  const visibleBranchesRef = useRef<GardenBranch[]>([]);
  const visibleQuoteEdgesRef = useRef<QuoteEdge[]>([]);
  const nodeDataRef = useRef<Map<string, GardenNode>>(new Map());
  const spatialIndexRef = useRef<Map<string, SpatialCell>>(new Map());

  // Growth animation
  const grownSetRef = useRef(new Set<string>());
  const growProgressRef = useRef(new Map<string, number>());
  // Bloom animation: tracks scale pulse for depth-3 branches
  const bloomProgressRef = useRef(new Map<string, number>());

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

        const nodes: GardenNode[] = data.nodes || [];
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Build node lookup
        const nodeMap = new Map<string, GardenNode>();
        for (const n of nodes) {
          nodeMap.set(n.id, n);
        }
        nodeDataRef.current = nodeMap;

        // Build the radial canopy garden
        const garden = buildRadialGarden(nodes, w * 2, h * 2);

        allBranchesRef.current = garden.branches;
        allQuoteEdgesRef.current = garden.quoteEdges;
        centersRef.current = garden.centers;

        // Build spatial index
        spatialIndexRef.current = buildSpatialIndex(garden.branches, SPATIAL_CELL_SIZE);

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
        // Start at the beginning so the garden grows from empty
        setCurrentTs(data.dateRange.min);
        currentTsRef.current = data.dateRange.min;

        // Initial filter — start empty, timeline will grow it
        visibleBranchesRef.current = [];
        visibleQuoteEdgesRef.current = [];
        setVisibleCount(0);

        // Center the view on the garden
        const allX = garden.centers.map(c => c.cx);
        const allY = garden.centers.map(c => c.cy);
        if (allX.length > 0) {
          const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
          const centerY = (Math.min(...allY) + Math.max(...allY)) / 2;
          const spread = Math.max(
            Math.max(...allX) - Math.min(...allX),
            Math.max(...allY) - Math.min(...allY),
          );
          const fitZoom = Math.min(w, h) / (spread + 200);
          const zoom = Math.max(0.3, Math.min(2, fitZoom));
          zoomRef.current = zoom;
          panRef.current = {
            x: w / 2 - centerX * zoom,
            y: h / 2 - centerY * zoom,
          };
        }

        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Garden fetch error:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Update refs on state changes ────────────────────────────────────────

  useEffect(() => {
    highlightRef.current = highlightedTag;
  }, [highlightedTag]);

  useEffect(() => {
    const prevTs = currentTsRef.current;
    currentTsRef.current = currentTs;

    // If timeline moved backward, reset growth so branches re-animate
    if (currentTs < prevTs) {
      grownSetRef.current.clear();
      growProgressRef.current.clear();
      bloomProgressRef.current.clear();
    }

    const filtered = filterGardenByTimestamp(
      allBranchesRef.current,
      allQuoteEdgesRef.current,
      currentTs,
    );
    visibleBranchesRef.current = filtered.branches;
    visibleQuoteEdgesRef.current = filtered.quoteEdges;
    setVisibleCount(filtered.branches.filter(b => b.depth === 3).length);
  }, [currentTs]);

  // ─── Canvas Resize ──────────────────────────────────────────────────────

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

  // ─── Pan / Zoom Handlers ────────────────────────────────────────────────

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

      panRef.current.x =
        cx - (cx - panRef.current.x) * (newZoom / zoomRef.current);
      panRef.current.y =
        cy - (cy - panRef.current.y) * (newZoom / zoomRef.current);
      zoomRef.current = newZoom;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        dragRef.current = {
          dragging: true,
          lastX: e.clientX,
          lastY: e.clientY,
        };
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
        // Hover detection — search visible branches for closest endpoint
        const rect = canvas.getBoundingClientRect();
        const mx =
          (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const my =
          (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

        let closest: GardenBranch | null = null;
        let closestDist = HOVER_RADIUS / zoomRef.current;

        const branches = visibleBranchesRef.current;
        // Only check a subset for performance
        const step = Math.max(1, Math.floor(branches.length / 5000));
        for (let i = 0; i < branches.length; i += step) {
          const b = branches[i];
          if (b.depth < 3) continue; // only hover on post branches
          const dx = b.to.x - mx;
          const dy = b.to.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < closestDist) {
            closest = b;
            closestDist = dist;
          }
        }

        // Also check exact neighbors if we have a rough hit
        if (closest) {
          const cellX = Math.floor(mx / SPATIAL_CELL_SIZE);
          const cellY = Math.floor(my / SPATIAL_CELL_SIZE);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const cell = spatialIndexRef.current.get(
                `${cellX + dx},${cellY + dy}`,
              );
              if (!cell) continue;
              for (const bi of cell.branches) {
                const b = allBranchesRef.current[bi];
                if (b.depth < 3) continue;
                if (b.timestamp > currentTsRef.current) continue;
                const ddx = b.to.x - mx;
                const ddy = b.to.y - my;
                const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                if (dist < closestDist) {
                  closest = b;
                  closestDist = dist;
                }
              }
            }
          }
        }

        if (closest) {
          const node = nodeDataRef.current.get(closest.nodeId);
          setTooltip({
            x: e.clientX,
            y: e.clientY,
            nodeId: closest.nodeId,
            tag: closest.tag,
            surprise: closest.surprise,
            textPreview: node?.textPreview || '',
            timestamp: closest.timestamp,
            variety: node?.variety || 'original',
            wordCount: node?.wordCount || 0,
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

  // ─── Render Loop ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;
      const zoom = zoomRef.current;
      const pan = panRef.current;
      const highlight = highlightRef.current;
      const branches = visibleBranchesRef.current;
      const quoteEdges = visibleQuoteEdgesRef.current;
      const centers = centersRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w * dpr, h * dpr);

      // Background
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w * dpr, h * dpr);

      // Transform: dpr scaling, then pan, then zoom
      ctx.setTransform(
        dpr * zoom,
        0,
        0,
        dpr * zoom,
        dpr * pan.x,
        dpr * pan.y,
      );

      // ── Spatial culling ──
      const visibleCells = getVisibleCells(pan.x, pan.y, zoom, w, h, SPATIAL_CELL_SIZE);

      // ── Draw quote edges (dashed, behind branches) ──
      if (quoteEdges.length < 2000) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.08;
        for (const edge of quoteEdges) {
          // Draw curved arc for cross-pollination
          const mx = (edge.from.x + edge.to.x) / 2;
          const my = (edge.from.y + edge.to.y) / 2;
          const dx = edge.to.x - edge.from.x;
          const dy = edge.to.y - edge.from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          // Perpendicular offset for arc
          const arcOffset = len * 0.15;
          const cpx = mx + (-dy / (len || 1)) * arcOffset;
          const cpy = my + (dx / (len || 1)) * arcOffset;

          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.moveTo(edge.from.x, edge.from.y);
          ctx.quadraticCurveTo(cpx, cpy, edge.to.x, edge.to.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── Draw center seeds (filled circles at tree centers) ──
      ctx.save();
      for (const center of centers) {
        const isHighlighted =
          highlight === null || highlight === center.tag;
        ctx.globalAlpha = isHighlighted ? 0.5 : 0.08;
        ctx.fillStyle = center.color;
        ctx.beginPath();
        const seedRadius = Math.max(3, Math.sqrt(center.postCount) * 0.15);
        ctx.arc(center.cx, center.cy, seedRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ── Draw center labels at {cx, cy} ──
      if (zoom > 0.3) {
        ctx.save();
        for (const center of centers) {
          const isHighlighted =
            highlight === null || highlight === center.tag;
          ctx.globalAlpha = isHighlighted ? 0.35 : 0.06;
          ctx.fillStyle = center.color;
          ctx.font = `600 ${Math.max(8, 11 / zoom)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(center.tag, center.cx, center.cy + (Math.max(6, Math.sqrt(center.postCount) * 0.15) + 10 / zoom));
        }
        ctx.restore();
      }

      // ── Draw branches batched by color ──
      // Group branches by tag for fewer strokeStyle changes
      const branchesByTag = new Map<string, number[]>();
      for (let i = 0; i < branches.length; i++) {
        const tag = branches[i].tag;
        if (!branchesByTag.has(tag)) branchesByTag.set(tag, []);
        branchesByTag.get(tag)!.push(i);
      }

      // LOD: at low zoom, skip depth-3 (individual posts) — only show structure
      const showPosts = zoom > 0.25;
      const showParticles = zoom > 0.8;
      const showGlow = zoom > 0.4;

      for (const [tag, indices] of branchesByTag) {
        const color = TAG_COLORS[tag] || '#6e7681';
        ctx.strokeStyle = color;

        for (const i of indices) {
          const branch = branches[i];

          // LOD skip: at low zoom, only draw structural branches (depth 1-2)
          if (!showPosts && branch.depth === 3) continue;

          // Spatial cull check
          const mx = (branch.from.x + branch.to.x) / 2;
          const my = (branch.from.y + branch.to.y) / 2;
          const cellX = Math.floor(mx / SPATIAL_CELL_SIZE);
          const cellY = Math.floor(my / SPATIAL_CELL_SIZE);
          if (!visibleCells.has(`${cellX},${cellY}`)) continue;

          const isHighlighted =
            highlight === null || highlight === branch.tag;

          // Growth animation
          let progress = grownSetRef.current.has(branch.nodeId) ? 1 : 0;
          if (!grownSetRef.current.has(branch.nodeId)) {
            const current =
              growProgressRef.current.get(branch.nodeId) || 0;
            const next = Math.min(1, current + 0.06);
            growProgressRef.current.set(branch.nodeId, next);
            progress = next;
            if (next >= 1) {
              grownSetRef.current.add(branch.nodeId);
              growProgressRef.current.delete(branch.nodeId);

              // Start bloom animation for depth-3 branches
              if (branch.depth === 3) {
                bloomProgressRef.current.set(branch.nodeId, 0);
              }
            }
          }
          if (progress <= 0) continue;

          // Bloom scale for depth-3 branches (0 -> 1.2 -> 1.0 over BLOOM_FRAMES)
          let bloomScale = 1;
          if (branch.depth === 3 && bloomProgressRef.current.has(branch.nodeId)) {
            const bloomFrame = bloomProgressRef.current.get(branch.nodeId)!;
            const nextBloom = bloomFrame + 1;
            if (nextBloom >= BLOOM_FRAMES) {
              bloomProgressRef.current.delete(branch.nodeId);
              bloomScale = 1;
            } else {
              bloomProgressRef.current.set(branch.nodeId, nextBloom);
              // Scale: 0 -> 1.2 at frame 8, -> 1.0 at frame 15
              const t = nextBloom / BLOOM_FRAMES;
              if (t < 0.53) {
                bloomScale = t / 0.53 * 1.2;
              } else {
                bloomScale = 1.2 - (t - 0.53) / 0.47 * 0.2;
              }
            }
          }

          const opacity = isHighlighted
            ? branch.opacity
            : branch.opacity * 0.05;

          ctx.save();
          ctx.globalAlpha = opacity * progress;
          ctx.strokeStyle = color;

          // Use pre-computed lineWidth, with depth-specific adjustments
          const lineWidth = branch.lineWidth * bloomScale;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'round';

          // Draw quadratic bezier
          ctx.beginPath();
          ctx.moveTo(branch.from.x, branch.from.y);

          if (progress < 1) {
            const t = progress;
            const ix1 =
              branch.from.x + (branch.control.x - branch.from.x) * t;
            const iy1 =
              branch.from.y + (branch.control.y - branch.from.y) * t;
            const ix2 =
              branch.control.x + (branch.to.x - branch.control.x) * t;
            const iy2 =
              branch.control.y + (branch.to.y - branch.control.y) * t;
            const endX = ix1 + (ix2 - ix1) * t;
            const endY = iy1 + (iy2 - iy1) * t;
            ctx.quadraticCurveTo(ix1, iy1, endX, endY);
          } else {
            ctx.quadraticCurveTo(
              branch.control.x,
              branch.control.y,
              branch.to.x,
              branch.to.y,
            );
          }
          ctx.stroke();

          // ── Surprise glow (radial glow for high surprise) ──
          if (
            showGlow &&
            branch.surprise > 12 &&
            isHighlighted &&
            progress >= 1 &&
            branch.depth === 3
          ) {
            const glowIntensity = Math.min(
              1,
              (branch.surprise - 12) / 2,
            );
            ctx.globalAlpha = glowIntensity * 0.2;
            ctx.lineWidth = branch.lineWidth * 3;
            ctx.strokeStyle = color;
            ctx.filter = 'blur(3px)';
            ctx.beginPath();
            ctx.moveTo(branch.from.x, branch.from.y);
            ctx.quadraticCurveTo(
              branch.control.x,
              branch.control.y,
              branch.to.x,
              branch.to.y,
            );
            ctx.stroke();
            ctx.filter = 'none';
          }

          ctx.restore();
        }
      }

      // ── Draw leaf tips on branch endpoints ──
      if (zoom > 0.5) {
        ctx.save();
        for (let i = 0; i < branches.length; i++) {
          const branch = branches[i];
          if (branch.depth < 3) continue;
          if (!grownSetRef.current.has(branch.nodeId)) continue;

          const isHighlighted =
            highlight === null || highlight === branch.tag;
          if (!isHighlighted) continue;

          // Spatial cull
          const cellX = Math.floor(branch.to.x / SPATIAL_CELL_SIZE);
          const cellY = Math.floor(branch.to.y / SPATIAL_CELL_SIZE);
          if (!visibleCells.has(`${cellX},${cellY}`)) continue;

          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(
            branch.to.x,
            branch.to.y,
            LEAF_RADIUS,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = TAG_COLORS[branch.tag] || '#6e7681';
          ctx.fill();

          // High-surprise glow dot
          if (branch.surprise > 12) {
            const glowIntensity = Math.min(
              1,
              (branch.surprise - 12) / 2,
            );
            ctx.globalAlpha = glowIntensity * 0.35;
            ctx.beginPath();
            ctx.arc(
              branch.to.x,
              branch.to.y,
              LEAF_RADIUS + 2,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = TAG_COLORS[branch.tag] || '#6e7681';
            ctx.filter = 'blur(2px)';
            ctx.fill();
            ctx.filter = 'none';
          }
        }
        ctx.restore();
      }

      // ── Particles (ambient sparkle near leaves) ──
      if (zoom > 0.8) {
        ctx.save();
        for (let i = 0; i < branches.length; i += 7) {
          const branch = branches[i];
          if (branch.depth < 3) continue;

          const isHighlighted =
            highlight === null || highlight === branch.tag;
          if (!isHighlighted) continue;
          if (!grownSetRef.current.has(branch.nodeId)) continue;

          const cellX = Math.floor(branch.to.x / SPATIAL_CELL_SIZE);
          const cellY = Math.floor(branch.to.y / SPATIAL_CELL_SIZE);
          if (!visibleCells.has(`${cellX},${cellY}`)) continue;

          const seed =
            (branch.nodeId.charCodeAt(0) || 0) * 31 +
            (branch.nodeId.charCodeAt(1) || 0);
          const count = seed % 3;
          for (let j = 0; j < count; j++) {
            const px =
              branch.to.x + (((seed * (j + 1) * 7) % 16) - 8);
            const py =
              branch.to.y + (((seed * (j + 1) * 13) % 16) - 8);
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            ctx.arc(px, py, 0.6, 0, Math.PI * 2);
            ctx.fillStyle = TAG_COLORS[branch.tag] || '#6e7681';
            ctx.fill();
          }
        }
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Reset growth animation on timeline scrub backward
  const prevTsRef = useRef(currentTs);
  useEffect(() => {
    if (currentTs < prevTsRef.current) {
      grownSetRef.current.clear();
      growProgressRef.current.clear();
      bloomProgressRef.current.clear();
    }
    prevTsRef.current = currentTs;
  }, [currentTs]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleTimelineChange = useCallback((ts: number) => {
    setCurrentTs(ts);
  }, []);

  const handleTagClick = useCallback((tag: string | null) => {
    setHighlightedTag(tag);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────

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
          {(title || 'THREADS GARDEN').toUpperCase()}
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

      {/* Timeline */}
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

      {/* Tag Labels */}
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
            background: 'rgba(20, 20, 22, 0.95)',
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

          {tooltip.textPreview && (
            <div
              style={{
                fontSize: 10,
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, sans-serif',
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
            {error ? `ERROR: ${error}` : 'GROWING...'}
          </div>
        </div>
      )}
    </div>
  );
}
