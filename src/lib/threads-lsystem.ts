/**
 * L-System growth algorithm for Threads Garden.
 *
 * Maps ~37K Threads posts to an organic tree visualization:
 * - 20 tag trees (one per primary tag), scattered across the canvas
 * - Each post grows as a branch from its tag's trunk
 * - Branch color = tag color
 * - Branch length = word count
 * - Surprise score = glow intensity
 * - Quote posts create dashed cross-pollination edges between trees
 */

import { TAG_COLORS } from './colors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GardenNode {
  id: string;
  timestamp: number;
  variety: 'original' | 'reply' | 'quote' | 'repost';
  tag: string;
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
  surprise: number;
  depth: number;
}

export interface QuoteEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  timestamp: number;
  fromId: string;
  toId: string;
}

export interface TreeTrunk {
  tag: string;
  x: number;
  y: number;
  color: string;
  postCount: number;
}

export interface GardenResult {
  branches: GardenBranch[];
  quoteEdges: QuoteEdge[];
  trunks: TreeTrunk[];
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

// ─── Tag ordering (sorted by typical frequency, deterministic) ───────────────

const TAG_ORDER = [
  'reaction', 'one-liner', 'tech', 'media', 'question', 'personal',
  'philosophy', 'daily-life', 'political', 'finance', 'shitpost', 'food',
  'race', 'meta-social', 'sex-gender', 'language', 'commentary', 'work',
  'creative', 'url-share',
];

// ─── Build the garden ────────────────────────────────────────────────────────

export function buildThreadsGarden(
  nodes: GardenNode[],
  canvasWidth: number,
  canvasHeight: number,
): GardenResult {
  if (nodes.length === 0) {
    return { branches: [], quoteEdges: [], trunks: [], nodePositions: new Map() };
  }

  const branches: GardenBranch[] = [];
  const quoteEdges: QuoteEdge[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();

  // ── Group posts by tag ──
  const tagGroups = new Map<string, GardenNode[]>();
  for (const node of nodes) {
    const tag = node.tag || 'reaction';
    if (!tagGroups.has(tag)) tagGroups.set(tag, []);
    tagGroups.get(tag)!.push(node);
  }

  // ── Position 20 tag trunks ──
  // Scatter them organically across the canvas using golden angle distribution
  const trunks: TreeTrunk[] = [];
  const trunkPositions = new Map<string, { x: number; y: number }>();

  const marginX = canvasWidth * 0.08;
  const marginY = canvasHeight * 0.10;
  const usableWidth = canvasWidth - marginX * 2;
  const usableHeight = canvasHeight - marginY * 2;

  const activeTags = TAG_ORDER.filter(t => tagGroups.has(t));
  // Add any tags not in TAG_ORDER
  for (const tag of tagGroups.keys()) {
    if (!activeTags.includes(tag)) activeTags.push(tag);
  }

  const tagCount = activeTags.length;

  // Use a grid-like layout with jitter for organic feel
  const cols = Math.ceil(Math.sqrt(tagCount * (usableWidth / usableHeight)));
  const rows = Math.ceil(tagCount / cols);
  const cellW = usableWidth / cols;
  const cellH = usableHeight / rows;

  for (let i = 0; i < activeTags.length; i++) {
    const tag = activeTags[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rng = seededRandom(hashStr(tag));

    // Center of cell + jitter
    const x = marginX + cellW * (col + 0.5) + (rng() - 0.5) * cellW * 0.4;
    // Trees grow upward, so trunk base is in the lower area of the cell
    const y = marginY + cellH * (row + 0.7) + (rng() - 0.5) * cellH * 0.25;

    trunkPositions.set(tag, { x, y });

    const postCount = tagGroups.get(tag)?.length || 0;
    trunks.push({
      tag,
      x,
      y,
      color: TAG_COLORS[tag] || '#6e7681',
      postCount,
    });
  }

  // ── Branch settings ──
  const BASE_TRUNK_LENGTH = Math.min(cellW, cellH) * 0.25;
  const MIN_BRANCH_LEN = 2;

  // ── Build each tag tree ──
  for (const tag of activeTags) {
    const tagPosts = tagGroups.get(tag);
    if (!tagPosts || tagPosts.length === 0) continue;

    const trunk = trunkPositions.get(tag)!;
    const color = TAG_COLORS[tag] || '#6e7681';
    const rng = seededRandom(hashStr(tag + '_tree'));

    // Sort posts by timestamp
    tagPosts.sort((a, b) => a.timestamp - b.timestamp);

    // Sub-group by day for creating sub-branches
    const dayGroups = new Map<string, GardenNode[]>();
    for (const post of tagPosts) {
      const d = new Date(post.timestamp);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
      dayGroups.get(dayKey)!.push(post);
    }

    // Trunk grows upward from base
    const trunkAngle = -90 + (rng() - 0.5) * 20; // mostly upward
    const trunkRad = (trunkAngle * Math.PI) / 180;
    const trunkTopX = trunk.x + Math.cos(trunkRad) * BASE_TRUNK_LENGTH;
    const trunkTopY = trunk.y + Math.sin(trunkRad) * BASE_TRUNK_LENGTH;

    // Store trunk top for branching
    nodePositions.set(`trunk_${tag}`, { x: trunkTopX, y: trunkTopY });

    // Draw trunk
    const midTrunkX = (trunk.x + trunkTopX) / 2;
    const midTrunkY = (trunk.y + trunkTopY) / 2;
    const trunkControl = {
      x: midTrunkX + (rng() - 0.5) * 8,
      y: midTrunkY + (rng() - 0.5) * 8,
    };

    branches.push({
      from: { x: trunk.x, y: trunk.y },
      to: { x: trunkTopX, y: trunkTopY },
      control: trunkControl,
      color,
      opacity: 0.7,
      timestamp: tagPosts[0].timestamp, // trunk appears with first post
      nodeId: `trunk_${tag}`,
      tag,
      surprise: 0,
      depth: 0,
    });

    // ── Distribute posts as branches along the trunk and sub-branches ──
    // Use a spiral/fan approach: each post gets a branch from a point
    // along the trunk, alternating left and right

    const dayKeys = [...dayGroups.keys()].sort();
    let branchIndex = 0;

    for (let di = 0; di < dayKeys.length; di++) {
      const dayPosts = dayGroups.get(dayKeys[di])!;

      // Attachment point along the trunk (distribute evenly)
      const t = dayKeys.length <= 1 ? 0.5 : di / (dayKeys.length - 1);
      const attachX = trunk.x + (trunkTopX - trunk.x) * (0.2 + t * 0.8);
      const attachY = trunk.y + (trunkTopY - trunk.y) * (0.2 + t * 0.8);

      for (let pi = 0; pi < dayPosts.length; pi++) {
        const post = dayPosts[pi];
        const postRng = seededRandom(hashStr(post.id));

        // Branch angle: alternate left/right, with spread
        const side = branchIndex % 2 === 0 ? -1 : 1;
        const spreadAngle = 30 + postRng() * 40; // 30-70 degrees from trunk
        const branchAngle = trunkAngle + side * spreadAngle + (postRng() - 0.5) * 10;

        // Branch length: based on word count, clamped
        const wc = post.wordCount || 5;
        const branchLen = Math.max(MIN_BRANCH_LEN, Math.min(
          BASE_TRUNK_LENGTH * 0.6,
          3 + Math.sqrt(wc) * 1.5,
        ));

        const rad = (branchAngle * Math.PI) / 180;
        const endX = attachX + Math.cos(rad) * branchLen;
        const endY = attachY + Math.sin(rad) * branchLen;

        // Bezier control point for organic curvature
        const midX = (attachX + endX) / 2;
        const midY = (attachY + endY) / 2;
        const perpRad = rad + Math.PI / 2;
        const curvature = branchLen * 0.2 * (postRng() - 0.5);
        const control = {
          x: midX + Math.cos(perpRad) * curvature,
          y: midY + Math.sin(perpRad) * curvature,
        };

        // Opacity: slightly randomized for organic feel
        const baseOpacity = 0.35 + postRng() * 0.35;

        branches.push({
          from: { x: attachX, y: attachY },
          to: { x: endX, y: endY },
          control,
          color,
          opacity: baseOpacity,
          timestamp: post.timestamp,
          nodeId: post.id,
          tag,
          surprise: post.surprise || 0,
          depth: 1,
        });

        nodePositions.set(post.id, { x: endX, y: endY });
        branchIndex++;
      }
    }
  }

  // ── Quote edges (cross-pollination between trees) ──
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

  return { branches, quoteEdges, trunks, nodePositions };
}

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
