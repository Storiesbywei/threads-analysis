/**
 * Cosmos Layout Engine — Orbital mechanics for Threads visualization.
 *
 * Maps ~40K Threads posts into a celestial system:
 * - 20 primary tags → solar systems (stars)
 * - 35 sub-tags → orbital rings around each star
 * - Individual posts → planets orbiting on their sub-tag's ring
 * - Word count → planet radius
 * - Surprise score → glow/brightness
 * - Quote posts → comets streaking between systems
 * - Time → orbital angle (timeline rotates planets)
 */

import { TAG_COLORS } from './colors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CosmosNode {
  id: string;
  timestamp: number;
  variety: 'original' | 'reply' | 'quote' | 'repost';
  tag: string;
  subTags: string[];
  surprise: number;
  wordCount: number;
  replyToId: string | null;
  quotedPostId: string | null;
  textPreview: string;
}

export interface Star {
  tag: string;
  x: number;
  y: number;
  color: string;
  radius: number;         // visual radius of the star itself
  postCount: number;
  orbits: OrbitRing[];
}

export interface OrbitRing {
  subTag: string;         // e.g. 'philosophy:continental' or '__default__' for untagged
  radiusA: number;        // semi-major axis (horizontal)
  radiusB: number;        // semi-minor axis (vertical)
  eccentricity: number;   // 0.1-0.2
  rotationOffset: number; // tilt angle of the ellipse (radians)
  speed: number;          // orbital speed multiplier (inner = faster)
  planets: Planet[];
}

export interface Planet {
  id: string;
  angle: number;          // base orbital angle (radians, from timestamp)
  radius: number;         // visual size of the planet
  brightness: number;     // 0-1, from surprise score
  hasRings: boolean;      // high-engagement posts get Saturn-like rings
  color: string;
  timestamp: number;
  tag: string;
  subTag: string;
  surprise: number;
  wordCount: number;
  variety: string;
  textPreview: string;
  replyToId: string | null;
  quotedPostId: string | null;
}

export interface CometArc {
  fromStarTag: string;
  toStarTag: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  timestamp: number;
  id: string;
}

export interface CosmosLayout {
  stars: Star[];
  comets: CometArc[];
  nodeMap: Map<string, Planet>;
  minTs: number;
  maxTs: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_STAR_SPACING = 350;     // minimum distance between star centers
const STAR_BASE_RADIUS = 8;       // base star visual radius
const STAR_RADIUS_SCALE = 0.03;   // scale factor for post count
const ORBIT_BASE_RADIUS = 60;     // innermost orbit radius
const ORBIT_RING_GAP = 35;        // gap between successive orbit rings
const ORBIT_ECCENTRICITY_MIN = 0.08;
const ORBIT_ECCENTRICITY_MAX = 0.18;

// ─── Poisson Disk Sampling for Star Placement ────────────────────────────────

function poissonDiskSample(
  count: number,
  width: number,
  height: number,
  minDist: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const cellSize = minDist / Math.sqrt(2);
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid: (number | null)[] = new Array(gridW * gridH).fill(null);

  const margin = minDist;

  function gridKey(x: number, y: number): number {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    return gy * gridW + gx;
  }

  function isValid(x: number, y: number): boolean {
    if (x < margin || x > width - margin || y < margin || y > height - margin)
      return false;
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        const idx = grid[ny * gridW + nx];
        if (idx !== null) {
          const p = points[idx];
          const ddx = p.x - x;
          const ddy = p.y - y;
          if (ddx * ddx + ddy * ddy < minDist * minDist) return false;
        }
      }
    }
    return true;
  }

  // Seed point
  const sx = width / 2 + (seededRandom(42) - 0.5) * width * 0.3;
  const sy = height / 2 + (seededRandom(43) - 0.5) * height * 0.3;
  points.push({ x: sx, y: sy });
  grid[gridKey(sx, sy)] = 0;

  const active = [0];
  let seed = 100;

  while (active.length > 0 && points.length < count) {
    const ri = Math.floor(seededRandom(seed++) * active.length);
    const pi = active[ri];
    const p = points[pi];
    let found = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = seededRandom(seed++) * Math.PI * 2;
      const dist = minDist + seededRandom(seed++) * minDist;
      const nx = p.x + Math.cos(angle) * dist;
      const ny = p.y + Math.sin(angle) * dist;

      if (isValid(nx, ny)) {
        const idx = points.length;
        points.push({ x: nx, y: ny });
        grid[gridKey(nx, ny)] = idx;
        active.push(idx);
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(ri, 1);
    }
  }

  return points.slice(0, count);
}

// Simple seeded random
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Build Cosmos ────────────────────────────────────────────────────────────

export function buildCosmos(
  nodes: CosmosNode[],
  canvasW: number,
  canvasH: number,
): CosmosLayout {
  if (nodes.length === 0) {
    return { stars: [], comets: [], nodeMap: new Map(), minTs: 0, maxTs: 0 };
  }

  // Find time range
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const n of nodes) {
    if (n.timestamp < minTs) minTs = n.timestamp;
    if (n.timestamp > maxTs) maxTs = n.timestamp;
  }
  const timeRange = maxTs - minTs || 1;

  // Group nodes by primary tag
  const tagGroups = new Map<string, CosmosNode[]>();
  for (const n of nodes) {
    const tag = n.tag || 'reaction';
    if (!tagGroups.has(tag)) tagGroups.set(tag, []);
    tagGroups.get(tag)!.push(n);
  }

  // Sort tags by post count descending for placement priority
  const sortedTags = [...tagGroups.entries()].sort((a, b) => b[1].length - a[1].length);

  // Place stars using Poisson disk sampling
  const positions = poissonDiskSample(
    sortedTags.length,
    canvasW,
    canvasH,
    MIN_STAR_SPACING,
  );

  // If Poisson didn't generate enough points, fall back to grid
  while (positions.length < sortedTags.length) {
    const angle = positions.length * 2.399963; // golden angle
    const r = 200 + positions.length * 80;
    positions.push({
      x: canvasW / 2 + Math.cos(angle) * r,
      y: canvasH / 2 + Math.sin(angle) * r,
    });
  }

  const nodeMap = new Map<string, Planet>();
  const stars: Star[] = [];
  const comets: CometArc[] = [];
  const starPositions = new Map<string, { x: number; y: number }>();

  for (let si = 0; si < sortedTags.length; si++) {
    const [tag, tagNodes] = sortedTags[si];
    const pos = positions[si];
    const color = TAG_COLORS[tag] || '#6e7681';

    starPositions.set(tag, pos);

    // Group by sub-tag
    const subTagGroups = new Map<string, CosmosNode[]>();
    for (const n of tagNodes) {
      // Find the sub-tag matching this parent tag
      const matchingSub = n.subTags.find(st => st.startsWith(tag + ':'));
      const subKey = matchingSub || `${tag}:__default__`;
      if (!subTagGroups.has(subKey)) subTagGroups.set(subKey, []);
      subTagGroups.get(subKey)!.push(n);
    }

    const subTagEntries = [...subTagGroups.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );

    // Build orbit rings
    const orbits: OrbitRing[] = [];
    const starRadius = STAR_BASE_RADIUS + Math.sqrt(tagNodes.length) * STAR_RADIUS_SCALE;

    for (let oi = 0; oi < subTagEntries.length; oi++) {
      const [subTag, subNodes] = subTagEntries[oi];
      const orbitRadius = ORBIT_BASE_RADIUS + oi * ORBIT_RING_GAP;
      const eccentricity =
        ORBIT_ECCENTRICITY_MIN +
        seededRandom(subTag.charCodeAt(0) + oi * 7) *
          (ORBIT_ECCENTRICITY_MAX - ORBIT_ECCENTRICITY_MIN);

      // Kepler-ish: inner orbits are faster
      const speed = 1.0 / Math.sqrt(1 + oi * 0.5);

      // Slight tilt per orbit
      const rotationOffset =
        seededRandom(subTag.charCodeAt(1) + oi * 13) * 0.4 - 0.2;

      const radiusA = orbitRadius;
      const radiusB = orbitRadius * (1 - eccentricity);

      const planets: Planet[] = [];

      for (const n of subNodes) {
        // Angle from timestamp — distribute across 2PI
        const timeFraction = (n.timestamp - minTs) / timeRange;
        const angle = timeFraction * Math.PI * 2;

        // Planet size from word count
        const planetRadius = 2 + Math.sqrt(Math.max(1, n.wordCount)) * 0.5;

        // Brightness from surprise
        const brightness = Math.min(1, Math.max(0.15, (n.surprise || 0) / 10));

        const planet: Planet = {
          id: n.id,
          angle,
          radius: planetRadius,
          brightness,
          hasRings: (n.wordCount || 0) > 100, // long posts get rings
          color,
          timestamp: n.timestamp,
          tag,
          subTag,
          surprise: n.surprise,
          wordCount: n.wordCount,
          variety: n.variety,
          textPreview: n.textPreview,
          replyToId: n.replyToId,
          quotedPostId: n.quotedPostId,
        };

        planets.push(planet);
        nodeMap.set(n.id, planet);
      }

      orbits.push({
        subTag,
        radiusA,
        radiusB,
        eccentricity,
        rotationOffset,
        speed,
        planets,
      });
    }

    stars.push({
      tag,
      x: pos.x,
      y: pos.y,
      color,
      radius: starRadius,
      postCount: tagNodes.length,
      orbits,
    });
  }

  // Build comet arcs (quote posts connecting two different tag systems)
  for (const n of nodes) {
    if (n.variety === 'quote' && n.quotedPostId) {
      const fromPlanet = nodeMap.get(n.id);
      const toPlanet = nodeMap.get(n.quotedPostId);
      if (fromPlanet && toPlanet && fromPlanet.tag !== toPlanet.tag) {
        const fromStar = starPositions.get(fromPlanet.tag);
        const toStar = starPositions.get(toPlanet.tag);
        if (fromStar && toStar) {
          comets.push({
            fromStarTag: fromPlanet.tag,
            toStarTag: toPlanet.tag,
            fromX: fromStar.x,
            fromY: fromStar.y,
            toX: toStar.x,
            toY: toStar.y,
            timestamp: n.timestamp,
            id: n.id,
          });
        }
      }
    }
  }

  return { stars, comets, nodeMap, minTs, maxTs };
}

// ─── Orbital Position Calculator ─────────────────────────────────────────────

/**
 * Given a planet's base angle and the current animation time,
 * compute its (x, y) position on the elliptical orbit.
 */
export function planetPosition(
  star: Star,
  orbit: OrbitRing,
  planet: Planet,
  animationAngle: number,
): { x: number; y: number } {
  // Combine base angle (from timestamp) with animation rotation
  const theta = planet.angle + animationAngle * orbit.speed;

  // Elliptical orbit (rotated)
  const cos = Math.cos(orbit.rotationOffset);
  const sin = Math.sin(orbit.rotationOffset);
  const ex = orbit.radiusA * Math.cos(theta);
  const ey = orbit.radiusB * Math.sin(theta);

  return {
    x: star.x + ex * cos - ey * sin,
    y: star.y + ex * sin + ey * cos,
  };
}

/**
 * Compute a point on the orbit ellipse at angle theta (for drawing trails).
 */
export function orbitPoint(
  star: Star,
  orbit: OrbitRing,
  theta: number,
): { x: number; y: number } {
  const cos = Math.cos(orbit.rotationOffset);
  const sin = Math.sin(orbit.rotationOffset);
  const ex = orbit.radiusA * Math.cos(theta);
  const ey = orbit.radiusB * Math.sin(theta);

  return {
    x: star.x + ex * cos - ey * sin,
    y: star.y + ex * sin + ey * cos,
  };
}

// ─── Filter by timestamp ─────────────────────────────────────────────────────

export function filterCosmosByTimestamp(
  stars: Star[],
  comets: CometArc[],
  maxTs: number,
): { visiblePlanets: number; filteredComets: CometArc[] } {
  let visiblePlanets = 0;

  for (const star of stars) {
    for (const orbit of star.orbits) {
      for (const planet of orbit.planets) {
        if (planet.timestamp <= maxTs) {
          visiblePlanets++;
        }
      }
    }
  }

  const filteredComets = comets.filter(c => c.timestamp <= maxTs);

  return { visiblePlanets, filteredComets };
}
