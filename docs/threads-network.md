# Threads Knowledge Graph — Force-Directed Network

**Page:** `/glyphary/threads/network`
**Source file:** `src/pages/glyphary/threads/network.astro`
**Data source:** `knowledge-graph.json` (1,638 nodes, 11,155 edges)
**Corpus:** 37,912 posts → PMI co-occurrence + TF-IDF concept extraction

---

## Overview

The Knowledge Graph page renders a force-directed network visualization of topic relationships discovered through information-theoretic analysis. Nodes represent tags, sub-tags, concepts, and bridge words. Edges encode co-occurrence strength (NPMI), hierarchical containment (tag → sub-tag), and bridge links (words that span multiple topic categories).

The page title is "The Cartography of Thought."

---

## Sub-Navigation

Three-tab inline navigation shared across all three sub-pages:
- **Taxonomy** — Treemap + audit (`/glyphary/threads/taxonomy`)
- **Network** (active) — This page
- **Discourse** — 9-category deep-dive (`/glyphary/threads/discourse`)

---

## Network Statistics (Two Stat Card Rows)

Eight metric cards arranged in two rows of four:

| Metric | Description |
|--------|-------------|
| Total Nodes | Full graph node count (tags + sub-tags + concepts + bridges) |
| Total Edges | Full graph edge count (co-occurrence + hierarchical + bridge links) |
| Tag Nodes | Count of 20 primary topic tags |
| Sub-Tag Nodes | Count of 35 sub-classification nodes |
| Concept Nodes | Count of TF-IDF extracted concepts |
| Bridge Concepts | Count of words spanning 3+ topic categories |
| Strongest Pair | The tag pair with highest NPMI co-occurrence score |
| Most Connected | The tag with the highest degree (edge count) |

---

## Knowledge Graph

**Visualization:** Force-directed graph (SVG, 800x600)

The centerpiece visualization. A subset of the full graph is rendered:
- All 20 tag nodes
- All 35 sub-tag nodes
- Top 20 concept nodes (by post count)
- Top 10 bridge nodes (by category span)
- Edges connecting only shown nodes

### Force Layout

The layout is simulated at build time using a custom force-directed algorithm (no D3):
- **Repulsion:** Coulomb's law between all node pairs (O(n^2), acceptable for ~85 nodes)
- **Attraction:** Hooke's law along edges
- **Center gravity:** Gentle pull toward (400, 300)
- **Damping:** 0.95 per iteration, 200 iterations total
- **Boundary enforcement:** Nodes clamped to [margin, WIDTH-margin]

### Node Encoding

| Node Type | Color | Radius | Visual |
|-----------|-------|--------|--------|
| Tag | From 20-tag palette | 8-24px (log scale by post count) | Filled circle |
| Sub-tag | Inherited from parent | 5-16px | Filled circle |
| Concept | `#5a6b3a` | 4-10px | Filled circle |
| Bridge | `#8b6914` | 3-8px | Filled circle |

### Edge Encoding

| Edge Type | Stroke | Opacity |
|-----------|--------|---------|
| Co-occurrence | `#3d2e1a` | Proportional to NPMI weight |
| Hierarchical | `#6b5a3e` | Fixed 0.3 |
| Bridge link | `#8b6914` | Fixed 0.15 |

### Interactivity (Client-Side)

- **Hover:** Pointer enters a node → tooltip displays label, type, and post count
- **Click:** Highlights the clicked node and all connected nodes/edges; dims everything else
- **Click again:** Deselects (restores all nodes)
- **Click empty space:** Clears selection

### visionOS Spatial Web Support

Progressive enhancement for Apple Vision Pro (added Feb 2026):

**CSS Adaptations:**
- All `:hover` rules duplicated to `:active` for visionOS pinch feedback
- `@media (pointer: coarse) and (hover: none)` block enlarges tap targets
- Border-radius on interactive elements for polished gaze highlights

**Pointer Events:**
- `mouseenter`/`mousemove`/`mouseleave` replaced with `pointerenter`/`pointermove`/`pointerleave`
- Unified input handling across mouse, touch, and gaze-and-pinch

**WebXR Immersive Session:**
On XR-capable devices (visionOS Safari), clicking a graph node reveals an "Enter Spatial View" button. Tapping it launches a WebXR `immersive-vr` session via Three.js (CDN-loaded):
- Procedurally generated 360° panorama sphere themed to the clicked topic's color
- Parchment-textured atmospheric backdrop with folio rules
- Topic label and post count as floating 3D text sprites at eye level
- Connected topics arranged in a slowly rotating ring at 30° intervals
- "Pinch to exit" instruction at bottom of view

**Spatial Audio (Web Audio API):**
Inside the XR session, a medieval scriptorium soundscape plays using `PannerNode` with HRTF binaural rendering:

| Sound | Technique | Position |
|-------|-----------|----------|
| Quill scratching | Bandpass-filtered white noise (2-4kHz) | Front-right, 1m |
| Page turning | Brown noise sweep with envelope | Alternating L/R, 2m |
| Binding creak | Low-pass filtered impulse (80-200Hz) | Below center |
| Ambient room tone | Brown noise, 40-120Hz | Omnidirectional |
| Ink dip | Bandpass click + resonance | Front-left, 0.5m |
| Whispered Latin | Oscillator formant synthesis | Behind, 4m |

Topic-specific audio variation: warmer-colored topics get more quill scratching; cooler topics get more ambient tones.

**Fallback:** Non-XR browsers see zero behavioral change — no button, no Three.js loaded, no audio.

---

## Co-Occurrence Affinities

**Visualization:** HTML data table

Top 20 strongest co-occurrence pairs ranked by NPMI (Normalized Pointwise Mutual Information). Columns:

| Column | Description |
|--------|-------------|
| # | Rank (1-20) |
| Pair | Source tag ↔ Target tag |
| NPMI | Normalized PMI score (0 to 1, higher = stronger association) |
| Count | Raw co-occurrence count (posts containing both tags) |
| Strength | Inline horizontal bar proportional to NPMI |

NPMI normalizes mutual information by the joint probability, making scores comparable across pairs with different base frequencies.

---

## Bridge Concepts

**Visualization:** Card grid

Bridge concepts are words that appear in posts spanning 3 or more topic categories. Each card displays:
- **Bridge word** (label)
- **Metadata:** Number of categories spanned + total post count
- **Category badges:** Colored pills showing which topic categories the word bridges

Sorted by category count (descending), then post count. Top 30 displayed.

Bridge concepts reveal the vocabulary that connects disparate discourse categories — words like "people," "power," or "culture" that function as conceptual bridges.

---

## Footer

Summary paragraph describing graph construction methodology: corpus size, tag/sub-tag counts, PMI co-occurrence calculation, and bridge concept identification.

---

## Data Pipeline

```
threads/posts.json (raw)
  → information-theory.mjs (20-tag classification + surprise scores)
  → knowledge-graph.mjs (PMI co-occurrence + TF-IDF concepts + bridge detection)
  → knowledge-graph.json (1,638 nodes, 11,155 edges)
  → network.astro (force layout simulation + SVG rendering + WebXR)
```

---

## Technical Notes

- Force-directed layout runs at build time in the Astro frontmatter (~200 iterations)
- Custom implementation — no D3, no force-simulation library
- Three.js loaded dynamically from CDN only on XR-capable devices (zero bundle impact on desktop)
- All spatial audio is procedurally synthesized — no external audio files
- Knowledge graph JSON: `knowledge-graph.mjs` computes PMI/NPMI from tag co-occurrence matrices, extracts TF-IDF concepts, and identifies bridge words spanning 3+ categories
- 29 regression tests in `knowledge-graph.test.mjs` verify schema, PMI math, and edge references
