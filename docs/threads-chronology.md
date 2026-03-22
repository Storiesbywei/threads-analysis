# Threads Chronology & Linguistics

**Page:** `/glyphary/threads`
**Source file:** `src/pages/glyphary/threads.astro` (~3,650 lines)
**Data sources:** `index.json`, `post-tags.json`, `sleep.json`, `threads/posts.json` (raw)
**Corpus:** 37,912 Threads posts from @maybe_foucault

---

## Overview

The main Threads page is the largest single page in the project — a seven-section Foucauldian analysis of the entire Threads posting archive. Every visualization is pure SVG generated at build time in the Astro frontmatter. The page is organized by Roman-numeral sections following the structure of an archaeological excavation: from raw inventory (I) through epistemic strata (II), confession (III), temporal apparatus (IV), cross-domain correlations (V), reception metrics (VI), and information theory (VII).

---

## I. The Archive

*"A quantitative inventory of utterances"*

### Stats Card Row
Eight metric cards providing a census of the corpus:
- Total utterances (post count)
- Words written (total word count)
- Unique vocabulary (distinct words)
- Average words per post
- Average unique words per active day
- Quote ratio (percentage of quotes vs. originals)
- Active days (days with at least one post)
- Profanity percentage

### The Accumulation of Statements
**Visualization:** Stacked bar chart (monthly)
Shows monthly output broken down into three post types: original posts, quote-posts, and replies. Each month is a vertical bar with stacked segments colored by type.

### The Calendar of Presence
**Visualization:** Calendar heatmap
Daily utterance density displayed as a year-long calendar grid. Each cell represents a single day, colored by posting volume (lighter = fewer posts, darker = more). Reveals weekly and seasonal rhythms.

### The Instruments of Form
**Visualization:** Horizontal bar chart
Media format distribution across the corpus: text, image, carousel, video, audio. Shows how posting style has shifted across media types.

---

## II. The Archaeology

*"Epistemic strata and discursive formations"*

### Discursive Strata
**Visualization:** Stacked area chart (monthly)
Topic proportions over time, rendered as geological strata. Each of the 20 LLM-classified tags is a colored band. The area chart reveals how discourse topics shift, grow, and recede month over month.

### The Twenty Discourses
**Visualization:** Multi-line chart
Top 10 of the 20 discourse tags plotted individually over time. Uses gap-aware rendering — months with zero posts for a tag break the line rather than drawing to zero. Shows which topics are persistent vs. episodic.

### I Contain Multitudes
**Visualization:** Line chart
Shannon entropy of the topic distribution measured monthly. Higher entropy = more diverse topic spread; lower entropy = concentrated discourse. Named after Whitman's *Song of Myself*. Tracks whether posting becomes more or less topically diverse over time.

### The Drift Between Voices
**Visualization:** Line chart
Monthly ratio of original posts to quote-posts. Measures the balance between monologic (original) and dialogic (quoting others) discourse. Tracks whether the account shifts toward commentary or original expression.

### The Weight of Words
**Visualization:** Line chart
Average words per post by month. Captures shifts in posting verbosity — whether posts trend toward brevity or essay-length.

### Lexical Archaeology
**Visualization:** Two-column layout

**Left column:** Cumulative vocabulary growth per quarter. Plots the number of unique words encountered for the first time, showing whether linguistic novelty accelerates or plateaus.

**Right column:** Word cloud of distinctive/rare vocabulary. Words sized by lexicographic rarity (inverse frequency). Surfaces the unusual, invented, and multilingual terms that distinguish this corpus.

**Interactive element:** "Did Wei Utter This Word?" — a text input oracle that searches the archive for any word and reports whether it appears, how many times, and when it was first used.

### Daily Lexical Range
**Visualization:** Line chart (weekly average)
Unique words per active day, smoothed to weekly average. Measures daily vocabulary diversity independent of posting volume.

### The Compound Register
**Visualization:** Two charts
Analysis of hyphenated compounds in the corpus. First chart: count of unique compounds over time. Second chart: categorization of compounds (e.g., adjective-noun, noun-noun, neologism). Reveals a distinctive stylistic pattern of compound coinage.

### Grammatical Violence
**Visualization:** Chart
Words that are bent across parts of speech — nouns used as verbs, adjectives used as nouns, etc. Surfaces deliberate morphological play and linguistic invention.

---

## III. The Confession

*"Technologies of the self and the examined life"*

### The Confessional Index
**Visualization:** Scatter/trend chart
First-person pronoun density (I, me, my, myself) vs. emotional vocabulary density, both z-score normalized per month. Plots the intersection of self-reference and affect — months that are both highly personal and highly emotional appear in the upper-right quadrant.

### The Profane Register
**Visualization:** Timeline chart
Monthly profanity rate as a percentage of total words. Tracks profanity (from the PROFANITY word set) over time.

### The Sentimental Instrument
**Visualization:** Timeline chart
Positive vs. negative sentiment by month, using keyword-based sentiment (POSITIVE_WORDS and NEGATIVE_WORDS sets). Two overlapping area series showing emotional polarity.

### The Linguistic Fingerprint
**Visualization:** Radar/spider chart (6 axes)
Writing style analysis measured per quarter across six dimensions. Each quarter is plotted as a polygon on the radar, revealing how the stylistic signature shifts over time.

### The Lexicon
**Visualization:** Horizontal bar chart
Most frequent non-stop-word terms in the corpus. After filtering stop words and usernames, displays the top N terms by raw frequency.

---

## IV. The Apparatus

*"The machinery of temporal habit"*

### The Horologium
**Visualization:** Polar/radial chart (24 hours)
Posting frequency by hour of day, rendered as a circular astrolabe. Separates original posts from quotes, showing when original thought vs. curation occurs. Named for the astronomical clock.

### Hourly Distribution
**Visualization:** Heatmap
Posting frequency by hour rendered as a heat grid. Shows concentration and gaps in the daily posting cycle.

### The Weekly Rhythm
**Visualization:** Bar chart (7 bars)
Day-of-week posting frequency. Reveals whether posting patterns differ between weekdays and weekends.

---

## V. The Correlations

*"The body, the silence, and the night"*

### The Night Scholar
**Visualization:** Scatter chart
Sleep duration (from `sleep.json`) vs. posting output for correlated dates. Tests whether less sleep correlates with more posts — or whether the "night scholar" posts more when sleep-deprived.

### The Research Pipeline
**Visualization:** Stacked horizontal bar
Percentage of posts preceded by clipboard activity (copy events) within a 30-minute window. Tests whether posting is preceded by research behavior — copying URLs, quotes, or reference material before composing.

### The Charging Confession
**Visualization:** Stacked horizontal bar
Percentage of posts preceded by device charging within a 30-minute window. Tests the hypothesis that charging the phone triggers a posting session.

### Cartography of Silence
**Visualization:** Timeline/gap analysis
Maps silence gaps — periods with no posting — by duration and position. Reveals rhythms of absence: vacations, outages, deliberate withdrawal.

---

## VI. The Reception (Conditional)

*"How the discourse is received — partial metrics from the Threads API"*

Only rendered if engagement data from the Threads API is available (requires raw posts with `metrics` field).

### Stats Card Row
Six metric cards: posts with metrics, total views, average views, average likes, engagement rate, top post views.

### Views vs. Likes
**Visualization:** Scatter plot
Each post plotted by views (x-axis) vs. likes (y-axis). Dot size scaled by word count. Reveals whether longer or shorter posts perform better, and the views-to-likes conversion rate.

### Most Viewed
Text display of the most-viewed post excerpt with its view and like counts.

---

## VII. The Information

*"Shannon's children — entropy, surprise, and the architecture of unpredictability"*

### Stats Card Row
Eight information-theoretic metrics: tag entropy, Zipf alpha, Heaps' beta, vocabulary size, mean surprise, word entropy, character entropy, conditional entropy.

### The Taxonomy
**Visualization:** Squarified treemap
The 20-tag LLM taxonomy with area proportional to post count. Each rectangle is colored by tag and labeled with name, count, and percentage.

### The Surprise Distribution
**Visualization:** Density plot
Per-post information surprise distribution. Surprise = -log2(P(tag)) — how unexpected each post's primary tag is given the corpus distribution. Shows whether posts cluster around expected topics or spread into surprising territory.

### The Character Strata
**Visualization:** Distribution chart
Post length distribution across the 500-character Threads limit. Shows whether posts cluster near the limit, are typically short, or follow a bimodal pattern.

### Mutual Information
**Visualization:** Heatmap
Feature-to-topic mutual information matrix. Measures how much knowing one feature (length, time of day, media type) tells you about the topic tag. I(Tag; Length) dominates at 0.982 bits.

### The Transition Matrix
**Visualization:** Matrix heatmap
Topic-to-topic transition probabilities. Each cell shows the probability of posting about topic B immediately after posting about topic A. Reveals habitual topic sequences.

### The Chaos Instruments
**Visualization:** Dashboard with 4 gauges
Four unpredictability metrics displayed as instrument gauges: stay rate (tendency to repeat the same topic), burst posting frequency, hapax ratio (percentage of words used only once), and Heaps' exponent (vocabulary growth rate).

### Per-Category Vocabulary Entropy
**Visualization:** Horizontal bar chart
Normalized vocabulary entropy by discourse tag. Shows which topics use the most diverse vocabulary and which are linguistically narrow.

---

## Technical Notes

- All visualizations are pure SVG generated at build time (no client-side charting library)
- The page loads ~5 JSON data files and processes them in a single-pass loop over all 1,257+ days
- Privacy filtering removes street addresses, "Country Village" strings, and location data
- The 20-tag taxonomy comes from `post-tags.json` (LLM-classified via `information-theory.mjs`)
- Engagement data (Section VI) requires raw Threads API exports which may not always be present
- The interactive word oracle uses a lazy-loaded word index (`word-index.json`)
