/**
 * Radial Canopy L-System for Threads Garden.
 *
 * Top-down tree canopy visualization of ~37K Threads posts:
 * - 20 tag trees placed via Poisson disk sampling, post-count-weighted radii
 * - Sub-tags create directional limbs (golden-angle spacing)
 * - Posts cluster along their sub-tag's limb, distance from center = time
 * - 4-depth branch hierarchy: center → limb stems → time segments → posts
 * - Surprise score → glow intensity (lineWidth + opacity)
 * - Quote posts → dashed cross-pollination arcs between trees
 */

import { TAG_COLORS } from './colors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GardenNode {
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

export interface GardenBranch {
  from: { x: number; y: number };
  to: { x: number; y: number };
  control: { x: number; y: number };
  color: string;
  opacity: number;
  timestamp: number;
  nodeId: string;
  tag: string;
  subTag: string | null;
  surprise: number;
  depth: number;          // 0=center, 1=limb, 2=segment, 3=post
  lineWidth: number;
}

export interface QuoteEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  timestamp: number;
  fromId: string;
  toId: string;
}

export interface TreeCenter {
  tag: string;
  cx: number;
  cy: number;
  radius: number;
  color: string;
  postCount: number;
}

export interface GardenResult {
  branches: GardenBranch[];
  quoteEdges: QuoteEdge[];
  centers: TreeCenter[];
  nodePositions: Map<string, { x: number; y: number }>;
}

// ─── Seeded RNG ──────────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashStr(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (1 - 1 / PHI); // ~2.39996 radians (~137.5°)
const MIN_RADIUS = 20;
const JITTER_ANGLE = (8.6 * Math.PI) / 180; // ±8.6° in radians
const SEGMENT_CLAMP_MIN = 2;
const SEGMENT_CLAMP_MAX = 8;
const POSTS_PER_SEGMENT = 15;

// Tags with defined sub-classifiers (9 of 20)
const TAGS_WITH_SUBS = new Set([
  'reaction', 'one-liner', 'question', 'media', 'race',
  'sex-gender', 'philosophy', 'tech', 'political',
]);

// ─── Tag ordering (sorted by typical frequency, deterministic) ───────────────

const TAG_ORDER = [
  'reaction', 'one-liner', 'tech', 'media', 'question', 'personal',
  'philosophy', 'daily-life', 'political', 'finance', 'shitpost', 'food',
  'race', 'meta-social', 'sex-gender', 'language', 'commentary', 'work',
  'creative', 'url-share',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bezierControl(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rng: () => number,
  curvatureScale = 0.25,
): { x: number; y: number } {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  // Perpendicular offset for organic curves
  const perpX = -dy / (len || 1);
  const perpY = dx / (len || 1);
  const offset = len * curvatureScale * (rng() - 0.5);
  return { x: mx + perpX * offset, y: my + perpY * offset };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Map surprise to visual weight: lineWidth 0.5-2.0, opacity 0.25-0.75 */
function surpriseWeight(surprise: number): { lineWidth: number; opacity: number } {
  if (surprise < 12) {
    // Low surprise: thin, dim
    const t = clamp(surprise / 12, 0, 1);
    return {
      lineWidth: 0.5 + t * 0.5,
      opacity: 0.25 + t * 0.15,
    };
  }
  // High surprise (>=12): thick, bright
  const t = clamp((surprise - 12) / 2, 0, 1); // 12-14 range maps to 0-1
  return {
    lineWidth: 1.0 + t * 1.0,
    opacity: 0.4 + t * 0.35,
  };
}

// ─── Poisson Disk Placement ─────────────────────────────────────────────────

interface DiskCandidate {
  tag: string;
  cx: number;
  cy: number;
  radius: number;
}

function poissonDiskPlace(
  tags: string[],
  postCounts: Map<string, number>,
  canvasW: number,
  canvasH: number,
  baseRadius: number,
): DiskCandidate[] {
  const maxCount = Math.max(...postCounts.values(), 1);
  const placed: DiskCandidate[] = [];
  const rng = seededRandom(42);

  const marginX = canvasW * 0.12;
  const marginY = canvasH * 0.12;
  const usableW = canvasW - marginX * 2;
  const usableH = canvasH - marginY * 2;

  // Sort tags by post count descending — place biggest trees first
  const sorted = [...tags].sort(
    (a, b) => (postCounts.get(b) || 0) - (postCounts.get(a) || 0),
  );

  for (const tag of sorted) {
    const count = postCounts.get(tag) || 1;
    const radius = Math.max(MIN_RADIUS, baseRadius * Math.sqrt(count / maxCount));

    let bestCx = marginX + usableW / 2;
    let bestCy = marginY + usableH / 2;
    let bestMinDist = -1;

    // Try many candidates, pick the one with best spacing
    const attempts = 80;
    for (let a = 0; a < attempts; a++) {
      const cx = marginX + rng() * usableW;
      const cy = marginY + rng() * usableH;

      // Check distance to all placed disks
      let minDist = Infinity;
      let overlaps = false;
      for (const p of placed) {
        const dx = cx - p.cx;
        const dy = cy - p.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minSep = radius + p.radius + 15; // 15px gap
        if (dist < minSep) {
          overlaps = true;
          break;
        }
        if (dist < minDist) minDist = dist;
      }

      if (!overlaps && minDist > bestMinDist) {
        bestCx = cx;
        bestCy = cy;
        bestMinDist = minDist;
      }
    }

    placed.push({ tag, cx: bestCx, cy: bestCy, radius });
  }

  return placed;
}

// ─── Build Radial Garden ─────────────────────────────────────────────────────

export function buildRadialGarden(
  nodes: GardenNode[],
  canvasWidth: number,
  canvasHeight: number,
): GardenResult {
  if (nodes.length === 0) {
    return { branches: [], quoteEdges: [], centers: [], nodePositions: new Map() };
  }

  const branches: GardenBranch[] = [];
  const quoteEdges: QuoteEdge[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();

  // ── 1. Group nodes by tag ──
  const tagGroups = new Map<string, GardenNode[]>();
  for (const node of nodes) {
    const tag = node.tag || 'reaction';
    if (!tagGroups.has(tag)) tagGroups.set(tag, []);
    tagGroups.get(tag)!.push(node);
  }

  // Determine active tags in canonical order
  const activeTags = TAG_ORDER.filter(t => tagGroups.has(t));
  for (const tag of tagGroups.keys()) {
    if (!activeTags.includes(tag)) activeTags.push(tag);
  }

  // Post counts
  const postCounts = new Map<string, number>();
  for (const [tag, posts] of tagGroups) {
    postCounts.set(tag, posts.length);
  }

  // ── 2. Place tree centers via Poisson disk sampling ──
  const BASE_RADIUS = Math.min(canvasWidth, canvasHeight) * 0.18;

  const disks = poissonDiskPlace(activeTags, postCounts, canvasWidth, canvasHeight, BASE_RADIUS);
  const diskMap = new Map<string, DiskCandidate>();
  for (const d of disks) diskMap.set(d.tag, d);

  const centers: TreeCenter[] = disks.map(d => ({
    tag: d.tag,
    cx: d.cx,
    cy: d.cy,
    radius: d.radius,
    color: TAG_COLORS[d.tag] || '#6e7681',
    postCount: postCounts.get(d.tag) || 0,
  }));

  // ── Global time range ──
  let globalMinTs = Infinity;
  let globalMaxTs = -Infinity;
  for (const node of nodes) {
    if (node.timestamp < globalMinTs) globalMinTs = node.timestamp;
    if (node.timestamp > globalMaxTs) globalMaxTs = node.timestamp;
  }
  const globalTimeSpan = globalMaxTs - globalMinTs || 1;

  // ── 3. For each tree, build radial canopy ──
  for (const tag of activeTags) {
    const tagPosts = tagGroups.get(tag);
    if (!tagPosts || tagPosts.length === 0) continue;

    const disk = diskMap.get(tag);
    if (!disk) continue;

    const { cx, cy, radius: treeRadius } = disk;
    const color = TAG_COLORS[tag] || '#6e7681';
    const rng = seededRandom(hashStr(tag + '_canopy'));

    // Sort posts by timestamp
    tagPosts.sort((a, b) => a.timestamp - b.timestamp);

    // Local time range for this tree
    const localMinTs = tagPosts[0].timestamp;
    const localMaxTs = tagPosts[tagPosts.length - 1].timestamp;
    const localTimeSpan = localMaxTs - localMinTs || 1;

    // ── 3a. Collect sub-tags and assign golden-angle limb directions ──
    type LimbDef = {
      label: string;      // sub-tag name or quarter label
      angle: number;       // limb direction in radians
      posts: GardenNode[];
    };

    const limbs: LimbDef[] = [];

    if (TAGS_WITH_SUBS.has(tag)) {
      // Group posts by their first matching sub-tag for this parent
      const subTagGroups = new Map<string, GardenNode[]>();
      const unassigned: GardenNode[] = [];

      for (const post of tagPosts) {
        // Find the first sub-tag that matches this parent tag
        const matchingSub = post.subTags.find(st => st.startsWith(tag + ':'));
        if (matchingSub) {
          if (!subTagGroups.has(matchingSub)) subTagGroups.set(matchingSub, []);
          subTagGroups.get(matchingSub)!.push(post);
        } else {
          unassigned.push(post);
        }
      }

      // Sort sub-tags by popularity (most popular first → most prominent direction)
      const sortedSubs = [...subTagGroups.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      );

      // Assign golden-angle limb directions
      let angleIdx = 0;
      for (const [subTag, posts] of sortedSubs) {
        limbs.push({
          label: subTag,
          angle: angleIdx * GOLDEN_ANGLE,
          posts,
        });
        angleIdx++;
      }

      // Distribute unassigned posts across existing limbs, or create one more limb
      if (unassigned.length > 0) {
        if (limbs.length > 0) {
          // Spread unassigned across existing limbs proportionally
          for (let i = 0; i < unassigned.length; i++) {
            limbs[i % limbs.length].posts.push(unassigned[i]);
          }
        } else {
          // No sub-tags matched at all — treat like a tag without subs
          const quarters = splitIntoQuarters(unassigned, localMinTs, localTimeSpan);
          for (let q = 0; q < quarters.length; q++) {
            if (quarters[q].length === 0) continue;
            limbs.push({
              label: `${tag}:q${q + 1}`,
              angle: q * GOLDEN_ANGLE,
              posts: quarters[q],
            });
          }
        }
      }
    } else {
      // ── 3b. Tags without sub-tags → split into 4 temporal quarters as artificial limbs ──
      const quarters = splitIntoQuarters(tagPosts, localMinTs, localTimeSpan);
      for (let q = 0; q < quarters.length; q++) {
        if (quarters[q].length === 0) continue;
        limbs.push({
          label: `${tag}:q${q + 1}`,
          angle: q * GOLDEN_ANGLE,
          posts: quarters[q],
        });
      }
    }

    // ── 3c. Emit depth-1 limb stem branches (short, thick) ──
    const LIMB_STEM_LENGTH = Math.max(8, treeRadius * 0.15);

    for (const limb of limbs) {
      const stemEndX = cx + Math.cos(limb.angle) * LIMB_STEM_LENGTH;
      const stemEndY = cy + Math.sin(limb.angle) * LIMB_STEM_LENGTH;

      const stemFrom = { x: cx, y: cy };
      const stemTo = { x: stemEndX, y: stemEndY };

      branches.push({
        from: stemFrom,
        to: stemTo,
        control: bezierControl(stemFrom, stemTo, rng, 0.15),
        color,
        opacity: 0.6,
        timestamp: limb.posts[0]?.timestamp || localMinTs,
        nodeId: `limb_${tag}_${limb.label}`,
        tag,
        subTag: limb.label.includes(':q') ? null : limb.label,
        surprise: 0,
        depth: 1,
        lineWidth: 2.5,
      });

      // ── 3d. For each limb: bin posts by time into N segments ──
      const segCount = clamp(
        Math.ceil(limb.posts.length / POSTS_PER_SEGMENT),
        SEGMENT_CLAMP_MIN,
        SEGMENT_CLAMP_MAX,
      );

      // Sort limb posts by timestamp
      limb.posts.sort((a, b) => a.timestamp - b.timestamp);

      // Create segments
      type Segment = {
        posts: GardenNode[];
        x: number;
        y: number;
        timestamp: number;
      };

      const segments: Segment[] = [];
      const postsPerSeg = Math.ceil(limb.posts.length / segCount);

      for (let s = 0; s < segCount; s++) {
        const segPosts = limb.posts.slice(
          s * postsPerSeg,
          (s + 1) * postsPerSeg,
        );
        if (segPosts.length === 0) continue;

        // Segment position along the limb direction at time-proportional distance
        const segFraction = (s + 0.5) / segCount;
        const segRadius = LIMB_STEM_LENGTH + segFraction * (treeRadius - LIMB_STEM_LENGTH);
        const segX = cx + Math.cos(limb.angle) * segRadius;
        const segY = cy + Math.sin(limb.angle) * segRadius;

        // Median timestamp of segment
        const medianTs = segPosts[Math.floor(segPosts.length / 2)].timestamp;

        segments.push({ posts: segPosts, x: segX, y: segY, timestamp: medianTs });

        // ── 3e. Emit depth-2 segment branches along the limb ──
        const segFrom = s === 0
          ? { x: stemEndX, y: stemEndY }
          : { x: segments[segments.length - 2]?.x ?? stemEndX, y: segments[segments.length - 2]?.y ?? stemEndY };
        const segTo = { x: segX, y: segY };

        branches.push({
          from: segFrom,
          to: segTo,
          control: bezierControl(segFrom, segTo, rng, 0.2),
          color,
          opacity: 0.45,
          timestamp: medianTs,
          nodeId: `seg_${tag}_${limb.label}_${s}`,
          tag,
          subTag: limb.label.includes(':q') ? null : limb.label,
          surprise: 0,
          depth: 2,
          lineWidth: 1.5,
        });
      }

      // ── 3f-g. Emit depth-3 post branches from nearest segment to post position ──
      for (const post of limb.posts) {
        const postRng = seededRandom(hashStr(post.id));

        // Time fraction within this tree's timespan
        const timeFraction = (post.timestamp - localMinTs) / localTimeSpan;

        // Post position: polar coords
        const angleJitter = (postRng() - 0.5) * 2 * JITTER_ANGLE;
        const postAngle = limb.angle + angleJitter;

        // Radial position: time-based with word count offset and jitter
        const wordOffset = Math.min(8, Math.sqrt(post.wordCount || 1) * 0.5);
        const radialJitter = (postRng() - 0.5) * treeRadius * 0.06;
        const postRadius = MIN_RADIUS + timeFraction * (treeRadius - MIN_RADIUS) + wordOffset + radialJitter;

        const postX = cx + Math.cos(postAngle) * postRadius;
        const postY = cy + Math.sin(postAngle) * postRadius;

        // Find nearest segment for branch origin
        let nearestSeg = segments[0];
        let nearestDist = Infinity;
        for (const seg of segments) {
          const dx = postX - seg.x;
          const dy = postY - seg.y;
          const dist = dx * dx + dy * dy;
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestSeg = seg;
          }
        }

        // Fallback if no segments
        const branchFrom = nearestSeg
          ? { x: nearestSeg.x, y: nearestSeg.y }
          : { x: stemEndX, y: stemEndY };

        const branchTo = { x: postX, y: postY };
        const sw = surpriseWeight(post.surprise || 0);

        const matchingSub = post.subTags.find(st => st.startsWith(tag + ':'));

        branches.push({
          from: branchFrom,
          to: branchTo,
          control: bezierControl(branchFrom, branchTo, postRng, 0.3),
          color,
          opacity: sw.opacity,
          timestamp: post.timestamp,
          nodeId: post.id,
          tag,
          subTag: matchingSub || null,
          surprise: post.surprise || 0,
          depth: 3,
          lineWidth: sw.lineWidth,
        });

        nodePositions.set(post.id, { x: postX, y: postY });
      }
    }
  }

  // ── 4. Build quote edges between trees ──
  for (const node of nodes) {
    if (node.quotedPostId && nodePositions.has(node.id) && nodePositions.has(node.quotedPostId)) {
      const from = nodePositions.get(node.id)!;
      const to = nodePositions.get(node.quotedPostId)!;
      quoteEdges.push({
        from,
        to,
        timestamp: node.timestamp,
        fromId: node.id,
        toId: node.quotedPostId,
      });
    }
  }

  // ── 5. Return GardenResult ──
  return { branches, quoteEdges, centers, nodePositions };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Split posts into 4 temporal quarters */
function splitIntoQuarters(
  posts: GardenNode[],
  minTs: number,
  timeSpan: number,
): GardenNode[][] {
  const quarters: GardenNode[][] = [[], [], [], []];
  for (const post of posts) {
    const fraction = (post.timestamp - minTs) / timeSpan;
    const qi = clamp(Math.floor(fraction * 4), 0, 3);
    quarters[qi].push(post);
  }
  return quarters;
}

// ─── Filter ──────────────────────────────────────────────────────────────────

/**
 * Filter branches and quote edges to only those at or before maxTimestamp.
 */
export function filterGardenByTimestamp(
  branches: GardenBranch[],
  quoteEdges: QuoteEdge[],
  maxTimestamp: number,
): { branches: GardenBranch[]; quoteEdges: QuoteEdge[] } {
  return {
    branches: branches.filter(b => b.timestamp <= maxTimestamp),
    quoteEdges: quoteEdges.filter(e => e.timestamp <= maxTimestamp),
  };
}
