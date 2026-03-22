# Threads Discourse — 9-Category Deep-Dive & Foucault Index

**Page:** `/glyphary/threads/discourse`
**Source file:** `src/pages/glyphary/threads/discourse.astro`
**Data sources:** `post-tags.json`, `threads/posts.json` (raw, for full post text)
**Corpus:** 37,912 posts classified across 9 discourse categories and 35 sub-tags

---

## Overview

The Discourse page is a deep-dive into the 9 discourse categories that have sub-tag classifications. For each category, it presents sub-tag distribution, sample posts ranked by information surprise, per-category statistics, and monthly activity. The page also includes a self-referential "Foucault Index" measuring how much the account @maybe_foucault discusses Foucault, and a cross-category analysis of posts spanning multiple discourse axes.

The page title is "The Discourse Archive."

---

## Sub-Navigation

Three-tab inline navigation shared across all three sub-pages:
- **Taxonomy** — Treemap + audit (`/glyphary/threads/taxonomy`)
- **Network** — Knowledge graph (`/glyphary/threads/network`)
- **Discourse** (active) — This page

---

## The Nine Categories

Each of the 9 discourse categories receives an identical section structure. The categories are:

| Category | Sub-Tags |
|----------|----------|
| **Race** | Cultural Reference, Structural Critique, Intersectional, Personal Experience |
| **Sex & Gender** | Queer Identity, Gender Discourse, Romantic Dynamics, Sexuality, Personal Reflection |
| **Philosophy** | Continental, Ethics & Morality, Epistemology, Social-Political |
| **Tech** | AI/ML, Programming, Crypto & Web3, Consumer Tech |
| **Political** | Domestic, International, Protest & Activism |
| **Reaction** | Affirmation, Humor, Negative, Emotive |
| **One-Liner** | Observation, Confession, Wit, Hot Take |
| **Question** | Rhetorical, Genuine, Engagement |
| **Media** | Film & TV, Music, Anime & Manga, Gaming |

### Per-Category Section Structure

Each category section contains:

#### 1. Category Header
Title with post count and colored indicator matching the tag palette.

#### 2. Sub-Tag Distribution Bar
**Visualization:** Stacked horizontal bar chart
Shows relative proportion of each sub-tag within the category. Bar segments colored by sub-tag, with opacity differentiation. Legend below lists each sub-tag with its count.

#### 3. Sub-Tag Sample Posts
For each sub-tag within the category, a block displaying:
- Sub-tag label and post count
- **Top 3 highest-surprise posts** for that sub-tag — the most informationally unexpected posts. Each sample shows:
  - Full post text (from raw posts, with URLs replaced by `[link]`)
  - Surprise score in bits
  - Word count

Surprise = -log2(P(tag)) — posts with tags that are rare in the corpus have high surprise. These samples surface the most unusual content within each sub-classification.

#### 4. Category Statistics
Four stat cards per category:

| Metric | Description |
|--------|-------------|
| Entropy | Shannon entropy of the sub-tag distribution within this category (bits) |
| Vocabulary Size | Distinct words used in posts with this tag |
| Normalized Entropy | Entropy / log2(sub-tag count) — 1.0 = perfectly uniform |
| Posts Analyzed | Total posts in this category |

Normalized entropy reveals whether sub-tags are evenly distributed (close to 1.0) or dominated by a single sub-tag (close to 0).

#### 5. Monthly Activity Mini Chart
**Visualization:** Vertical bar chart (last 12 months)
Monthly post volume for this category. Shows whether the category is gaining or losing prominence over time.

---

## The Foucault Index

*"How Much Does @maybe_foucault Talk About Foucault?"*

A self-referential meta-analysis of the account's relationship with its own namesake.

### Statistics Row
Three metrics:
- **Posts mentioning Foucault** — count of posts containing "foucault" (case-insensitive)
- **Percentage of all posts** — what fraction of the corpus references Foucault
- **Total mentions** — aggregate count of the word "foucault" across all posts

### Top 10 Most Foucault-Heavy Posts
Ranked blockquotes showing the posts with the highest density of Foucault references. Each post displays full text with the Foucault mention count.

### The Foucault Lexicon
**Visualization:** Horizontal bar chart
Frequency of Foucault-adjacent terms in the corpus: panopticon, biopolitics, governmentality, discourse, episteme, genealogy, archaeology, dispositif, etc. Reveals which Foucauldian concepts the account engages with most.

---

## Cross-Category Insights

Analysis of posts that span multiple discourse categories simultaneously.

### 1. Most Common Category Co-Occurrences
**Visualization:** Horizontal bar chart
Category pair co-occurrence counts. For all posts tagged with 2+ discourse categories, counts how often each pair appears together. Reveals which categories are most often discussed simultaneously (e.g., race + political, philosophy + sex-gender).

### 2. Highest-Surprise Multi-Category Posts
**Visualization:** Ranked post cards (top 5)
The 5 most informationally surprising posts that span multiple discourse categories. Each card shows:
- Full post text
- Surprise score (bits)
- Word count
- All assigned tags

These are the posts where the author is most unpredictable — discussing unusual combinations of topics simultaneously.

### 3. Average Surprise by Sub-Tag
**Visualization:** Ranked list with horizontal bars
All 35 sub-tags ranked by average information surprise. Shows:
- Sub-tag label
- Average surprise (bits)
- Sample size (n)
- Inline horizontal bar proportional to surprise

Sub-tags with high average surprise contain posts that are unusual for the corpus. Sub-tags with low average surprise are predictable — the account posts about them frequently enough that they carry little information.

---

## Data Pipeline

```
threads/posts.json (raw, for full text)
  → information-theory.mjs (20-tag classification + surprise scores)
  → sub-classifiers.mjs (9 parents → 35 sub-tags via keyword regex)
  → post-tags.json (posts[], tag_distribution, sub_tag_distribution, category_entropies)
  → discourse.astro (9 category sections + Foucault index + cross-category)
```

---

## Technical Notes

- All visualizations are pure SVG generated at build time
- Post text is loaded from raw `threads/posts.json` for full-text display (the `post-tags.json` does not contain post text)
- If raw posts are unavailable, sample post text falls back to `[text unavailable]`
- The 9 categories are the subset of the 20 primary tags that have sub-tag classifiers defined in `sub-classifiers.mjs`
- Category entropies are pre-computed in `post-tags.json` during the analysis pipeline
- Multi-category analysis only considers the 9 discourse categories (not all 20 tags)
- The Foucault Index performs a case-insensitive search across all raw post text
- 28 regression tests in `sub-classifiers.test.mjs` validate regex classification and multi-label assignment
