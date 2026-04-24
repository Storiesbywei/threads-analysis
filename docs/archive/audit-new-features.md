# Threads Analysis Platform Audit & New Feature Proposals

**Auditor expertise:** Social media analytics, information theory, digital marketing
**Date:** 2026-03-21
**Corpus:** 37,912 classified posts (45,938 total), 446,549 words, 25,804 vocabulary
**Account:** @maybe_foucault (Threads)
**Stack:** Astro 5 + React islands, PostgreSQL 17, Node.js ESM, Docker auto-sync

---

## Part 1: What's Already Strong

### Novel and Impressive

1. **Shannon entropy as a first-class content metric.** Most social media analytics tools use engagement counts. This platform treats every post as a signal in an information channel and measures its surprise relative to the corpus distribution. The per-post surprise score (average self-information in bits/word) is genuinely uncommon in social media tooling -- it transforms "what did I post about?" into "how predictable was I?"

2. **Corpus-level information-theoretic fingerprinting.** The dashboard surfaces character entropy (4.474 bits), word entropy (10.376 bits), bigram entropy (15.999 bits), conditional entropy (5.623 bits), Zipf exponent (0.999), and Heaps' law growth rate. This is a proper computational linguistics profile, not a vanity dashboard. The conditional entropy calculation H(W2|W1) = H(W1,W2) - H(W1) correctly estimates next-word predictability. The Zipf exponent at 0.999 is essentially ideal Zipfian -- a noteworthy finding that the vocabulary follows natural language rank-frequency laws almost perfectly.

3. **PMI/NPMI-weighted knowledge graph.** The knowledge graph is not a simple tag co-occurrence matrix. It computes normalized pointwise mutual information for every tag pair, filters to positive associations with minimum co-occurrence thresholds, and adds temporal proximity edges via a 5-post sliding window. Bridge concepts (words spanning 3+ categories) are a particularly clever addition -- they surface the vocabulary that acts as conceptual connective tissue across discourse domains.

4. **TF-IDF concept extraction per tag.** Rather than just counting words, the system treats each of the 20 tags as a "document" and extracts the top 10 terms by TF-IDF score. This surfaces the words that are distinctively important to each category, not just frequent overall.

5. **Topic transition entropy and burst analysis.** The Markov-chain analysis of topic transitions (post N's tag to post N+1's tag) with stay rate calculation is a sophisticated chaos metric. The burst analysis (inter-post intervals, threshold at 5 minutes) captures posting behavior that no standard analytics tool measures.

6. **Mutual information between features.** I(PrimaryTag; QuoteStatus), I(PrimaryTag; HourOfDay), I(PrimaryTag; PostLength), and I(PrimaryTag; DayOfWeek) are computed but only logged to console. These are high-value signals about behavioral coupling between content type and contextual features.

7. **The architectural separation is clean.** Pure math functions in `info-theory-lib.mjs`, classification in `sub-classifiers.mjs`, analysis pipeline in `information-theory.mjs`, graph computation in `knowledge-graph.mjs`. The Postgres schema mirrors the JSON output with proper tables for tags, sub-tags, surprise scores, knowledge graph nodes/edges, and time-series metrics.

8. **The Foucault Index.** Counting mentions of Foucault-adjacent terms (panopticon, biopolitics, governmentality, dispositif, etc.) in a self-referential meta-analysis of an account named @maybe_foucault is genuinely witty. It is both a legitimate lexical analysis and a commentary on discursive self-awareness.

### What's Standard (Competent but Not Novel)

- Regex-based classification with priority ordering. Effective for this corpus but inherently limited by keyword overlap and priority sequencing.
- Calendar heatmap, monthly bar charts, hour-of-day distribution, day-of-week bars. Standard temporal visualizations.
- Tag distribution treemaps and bar charts. Standard categorical breakdowns.
- The PostExplorer (search + filter) is a necessary CRUD interface but not analytically novel.
- Full-text search via PostgreSQL `to_tsvector` and GIN index -- standard but well-implemented.

---

## Part 2: Information Theory Gaps

### 2.1 Missing: Conditional Entropy of Topics Given Engagement

**What:** H(Tag | EngagementLevel). Given that a post received high/medium/low engagement, how much uncertainty remains about its topic?

**Why it matters:** If H(Tag | HighEngagement) is much lower than H(Tag), then high-engagement posts cluster in specific topics -- you know which lanes to stay in. If it remains high, engagement is topic-independent and depends on other factors (time, phrasing, cultural moment).

**Implementation:** Bucket posts by engagement quartile (views), compute tag entropy within each quartile, compare to overall tag entropy. Store in `corpus_snapshots.category_entropies` as an additional field.

### 2.2 Missing: KL Divergence Between Weekly Topic Distribution and Baseline

**What:** D_KL(P_week || P_overall) for each week in the corpus. Measures how much each week's topic distribution diverges from the long-run average.

**Why it matters:** Identifies "voice deviation weeks" -- periods where posting behavior was statistically unusual. These often correspond to external events (elections, tech releases, personal crises) that redirected discourse. A KL divergence timeline would be a powerful addition to the Chronology page.

**Implementation:** For each ISO week, compute the empirical topic distribution P_week over 20 tags. Compute D_KL(P_week || P_baseline) = sum_t P_week(t) * log2(P_week(t) / P_baseline(t)). Add Laplace smoothing to avoid division by zero. Output as a time series.

### 2.3 Missing: Perplexity Trends Over Time

**What:** Monthly perplexity = 2^H(W) computed on a per-month basis rather than corpus-wide.

**Why it matters:** Perplexity measures the effective vocabulary size -- how many words the model "needs" to predict the next word. Tracking perplexity monthly reveals whether writing is becoming more or less predictable. A declining perplexity trend might indicate vocabulary settling; an increasing trend suggests growing linguistic novelty.

**Implementation:** For each month, compute word entropy H_month on that month's posts only, then perplexity = 2^H_month. The current analysis computes per-category entropy but not per-period entropy.

### 2.4 Missing: Mutual Information Between Engagement and Surprise

**What:** I(EngagementLevel; SurpriseLevel). Does informationally surprising content perform better or worse?

**Why it matters:** This is the central question for any creator: does originality pay off? If MI is high, then surprise predicts engagement direction. If MI is near zero, the audience doesn't reward or punish unpredictability.

**Implementation:** Bucket posts by surprise quartile and engagement quartile, compute the 2D contingency table, apply the existing `mutualInformation()` function. Trivial given the existing infrastructure.

### 2.5 Missing: Cross-Entropy Between Your Corpus and a Reference Corpus

**What:** H(P_you, Q_reference) where Q_reference is the character/word distribution of general English text (or a sample of average Threads posts if obtainable via keyword search API).

**Why it matters:** Cross-entropy measures how well a model trained on one distribution predicts another. If your cross-entropy against general English is high, your writing is distinctively unusual. The character entropy of 4.474 bits already exceeds Shannon's 4.11-bit English estimate, but cross-entropy would formalize this comparison.

**Implementation:** Use a reference unigram distribution (e.g., Google Books Ngrams or Brown Corpus frequencies). Compute H(P_you, Q_ref) = -sum_w P_you(w) * log2(Q_ref(w)). Requires a one-time import of reference frequencies.

### 2.6 Missing: Conditional Entropy of Replies Given Original Post Topics

**What:** H(ReplyTopic | OriginalPostTopic). The `conversations` table stores reply text from other users. Classify replies using the same 20-tag taxonomy, then measure how much the original post's topic constrains the reply's topic.

**Why it matters:** Reveals whether your audience responds on-topic or goes off on tangents. Low conditional entropy = predictable discourse; high conditional entropy = your posts spark diverse responses.

**Implementation:** The `conversations` table already has `reply_text`. Run it through the same classifier, compute H(ReplyTag | OriginalTag).

### 2.7 Missing: Jensen-Shannon Divergence Between Post Types

**What:** JSD(P_original || P_reply || P_quote). Measures the symmetric divergence between the topic distributions of original posts, replies, and quote-posts.

**Why it matters:** Are you a different person when replying vs. posting original thoughts? JSD between the three modes would quantify voice consistency across interaction types.

**Implementation:** Split corpus by `variety` (original, reply, quote). Compute topic distribution for each. JSD = (D_KL(P||M) + D_KL(Q||M)) / 2 where M = (P+Q)/2. Add to `info-theory-lib.mjs`.

### 2.8 Missing: Entropy Rate Estimation

**What:** The true entropy rate h = lim(n->inf) H(W_n | W_{n-1}, ..., W_1). Currently only the first-order approximation (conditional bigram entropy) is computed.

**Why it matters:** The conditional entropy H(W2|W1) = 5.623 bits already shows a 46% predictability gain over the unigram entropy. Extending to trigrams would show how much additional context further constrains the language. The gap between H(W3|W2,W1) and H(W2|W1) indicates how much long-range structure exists in the writing.

**Implementation:** Compute trigram counts and trigram entropy, then H(W3|W2,W1) = H(W1,W2,W3) - H(W1,W2). Compare with the existing bigram result.

---

## Part 3: Social Media Analytics Gaps

### 3.1 Engagement Prediction Model

**Gap:** The platform stores engagement metrics (views, likes, replies, reposts, quotes, shares) in time-series format but does not correlate them with post features.

**What's needed:** A regression model (even a simple linear or logistic regression) predicting engagement from: primary tag, sub-tag, hour of day, day of week, word count, surprise score, is_quote, is_reply, has_url, has_media. The `metrics_latest` materialized view + `posts` + `tags` + `surprise_scores` tables have everything needed.

**Deliverable:** A feature importance ranking showing which factors most predict views/likes. Surfaced as a "What Drives Engagement?" section on the Overview page.

### 3.2 Engagement-Weighted Tag Performance

**Gap:** Tag distribution is currently shown by post count. There is no view of which tags generate the most engagement per post.

**What's needed:** For each of the 20 tags, compute median views, median likes, and engagement rate (likes + replies + reposts + quotes) / views. Rank tags by engagement efficiency, not volume.

**Deliverable:** A "Tag ROI" table showing: tag | post count | median views | median likes | engagement rate | views per post vs. corpus average.

### 3.3 Content Velocity Analysis

**Gap:** The burst analysis counts rapid-fire posting intervals but doesn't correlate posting frequency with engagement outcomes.

**What's needed:** Define "sessions" as clusters of posts within 30 minutes of each other. For each session, compute: number of posts, total views generated, average views per post. Compare single-post sessions vs. burst sessions. Does posting 5 things in 10 minutes dilute attention or amplify it?

**Deliverable:** A "Does Burst Posting Help?" card on the Chronology page with the answer.

### 3.4 Virality Signals

**Gap:** The platform stores shares and reposts but doesn't analyze what distinguishes viral posts from average ones.

**What's needed:** Define "viral" as top 5% by views. Compare the viral cohort against the rest on: word count distribution, tag distribution, surprise score distribution, time of day, day of week, has_url, is_quote, post length. Use a chi-squared test or Mann-Whitney U for each feature.

**Deliverable:** A "Virality Profile" section listing statistically significant predictors.

### 3.5 Audience Response Timing

**Gap:** The `conversations` table has `reply_timestamp` but no analysis of response latency.

**What's needed:** For each original post, compute time-to-first-reply and total reply count within 1 hour, 24 hours, and 7 days. Correlate response latency with post features (tag, surprise, time of day).

**Deliverable:** A "Response Dynamics" chart showing how quickly different topics attract replies.

### 3.6 Optimal Posting Schedule

**Gap:** The hourly and day-of-week distributions show when you post, but not when you should post.

**What's needed:** Cross-reference posting time with engagement. For each (hour, day_of_week) cell, compute average views and engagement rate. Identify the optimal posting windows -- hours where average engagement is highest.

**Deliverable:** A heatmap on the Chronology page with (hour x day-of-week) cells colored by average engagement, annotated with "best times to post."

---

## Part 4: Marketing Intelligence Gaps

### 4.1 Brand Voice Consistency Score

**Gap:** The word entropy is computed corpus-wide but not tracked over time.

**What's needed:** Monthly normalized word entropy as a "voice consistency" metric. If entropy increases, vocabulary is diversifying (brand voice is becoming less predictable). If it decreases, vocabulary is narrowing (more on-brand or more repetitive). The `corpus_snapshots` table already has a `word_entropy` field, but only one snapshot exists -- it should be computed per-month retroactively.

**Deliverable:** A "Voice Stability Index" line chart showing normalized word entropy per month, overlaid with a 3-month moving average.

### 4.2 Content Pillar Analysis

**Gap:** Tags are counted but not evaluated against engagement to determine which content pillars are over-served (high volume, low engagement) vs. under-served (low volume, high engagement).

**What's needed:** A 2x2 matrix: X-axis = post volume (normalized to percentage of corpus), Y-axis = average engagement per post. Tags in the upper-left quadrant (low volume, high engagement) are under-served opportunities. Tags in the lower-right (high volume, low engagement) are over-invested.

**Deliverable:** A scatter plot on the Taxonomy page with the 20 tags positioned in the volume-vs-engagement space, with quadrant labels: "Double Down" (high volume, high engagement), "Hidden Gems" (low volume, high engagement), "Bread & Butter" (high volume, medium engagement), "Reconsider" (high volume, low engagement).

### 4.3 Audience Sentiment in Replies

**Gap:** The `conversations` table stores `reply_text` from other users' replies, but this text is never analyzed.

**What's needed:** Run reply text through a basic sentiment classifier (positive/negative/neutral via keyword matching, consistent with the existing regex-based approach). For each of your 20 tags, compute the sentiment distribution of replies received. Does philosophy content generate more negative replies than tech content?

**Deliverable:** A "Reply Sentiment by Topic" stacked bar chart on the Discourse page.

### 4.4 Engagement Decay Curves

**Gap:** The `metrics` table stores time-series engagement snapshots per post but this data is only exposed via the API for individual post lookup.

**What's needed:** Aggregate engagement decay curves: for posts with multiple metric snapshots, plot how views/likes accumulate over time. Determine the "half-life" of a post -- how long until it has received 50% of its eventual total views. Segment by tag to see if some topics have longer shelf life.

**Deliverable:** A "Post Half-Life" analysis section showing average decay curves, segmented by tag.

### 4.5 Competitive Vocabulary Benchmarking

**Gap:** The platform analyzes only the user's own posts.

**What's needed:** Use the Threads keyword search API (GET /keyword_search) to sample posts from other users discussing the same topics (philosophy, tech, political, etc.). Compute word entropy and vocabulary stats for the sampled external corpus and compare against the user's own corpus. Is @maybe_foucault's vocabulary richer or narrower than the average Threads user discussing the same topics?

**Deliverable:** A "Comparative Linguistics" section showing side-by-side entropy, vocabulary size, and Zipf exponent for self vs. external samples.

---

## Part 5: Proposed New Dynamic Page Features

### Feature 1: KL Divergence Timeline

**What it shows:** A time-series chart showing the Kullback-Leibler divergence between each week's topic distribution and the overall corpus baseline. Weeks with high divergence are "voice deviation" periods where posting behavior was statistically unusual.

**Data source:** Existing `posts` table + `tags` table. Group by ISO week, compute per-week tag distribution, compare against `corpus_snapshots.tag_distribution`.

**Implementation:** New analysis function in `information-theory.mjs` that outputs a `weekly_kl_divergence` array to `post-tags.json`. New section on `chronology.astro` rendering an SVG line chart. Add `klDivergence(P, Q)` to `info-theory-lib.mjs`.

**Priority:** HIGH -- low effort (the math is trivial, the data exists), high insight value. This would be the single most powerful addition to the Chronology page.

---

### Feature 2: Surprise-Engagement Scatter Plot

**What it shows:** Every post plotted with surprise score (X-axis) vs. views (Y-axis), colored by primary tag. Reveals whether informationally surprising content performs better or worse with the audience. A trend line shows the correlation.

**Data source:** `surprise_scores` JOIN `metrics_latest` JOIN `tags`. All data exists.

**Implementation:** New API route `GET /api/surprise-engagement` joining the three tables. React scatter plot component using inline SVG (consistent with the existing approach). New section on `discourse.astro` or a dedicated "Insights" page.

**Priority:** HIGH -- answers the fundamental creator question: "does originality pay?"

---

### Feature 3: Topic Transition Sankey Diagram

**What it shows:** A Sankey/alluvial flow diagram showing the probability of transitioning between topics in consecutive posts. Width of each flow proportional to transition frequency. The transition entropy and stay rate are already computed but only logged to console.

**Data source:** Existing transition matrix computation in `information-theory.mjs` (lines 400-423). Currently not saved to JSON or Postgres.

**Implementation:** Add `transition_matrix` to `post-tags.json` output. New Astro component generating an SVG Sankey diagram at build time. Highlight the top 10 most common transitions and the rarest transitions (most surprising topic switches).

**Priority:** HIGH -- the data is already computed but thrown away. This is a visualization gap, not a data gap.

---

### Feature 4: Monthly Perplexity & Entropy Trend Dashboard

**What it shows:** Three overlaid time-series lines: (1) monthly word entropy H(W), (2) monthly perplexity 2^H(W), (3) monthly normalized tag entropy. Together these show whether writing is becoming more or less predictable at both the word level and the topic level.

**Data source:** Requires per-month recomputation of word entropy (currently only computed corpus-wide). Could be added to the analysis pipeline as a monthly loop.

**Implementation:** Extend `information-theory.mjs` to compute per-month word counts, word entropy, and tag entropy. Store in `corpus_snapshots` or a new `monthly_entropy` array in `post-tags.json`. Render as a multi-line SVG chart on `chronology.astro`.

**Priority:** HIGH -- perplexity trend is the most intuitive "am I becoming predictable?" metric.

---

### Feature 5: Engagement Heatmap (Hour x Day-of-Week)

**What it shows:** A 24x7 heatmap where each cell shows the average views (or engagement rate) for posts published at that specific (hour, day) combination. Highlights optimal posting windows in green and dead zones in red.

**Data source:** `posts.timestamp` + `metrics_latest.views`. All data exists.

**Implementation:** New API route `GET /api/engagement-heatmap` with a GROUP BY query: `EXTRACT(HOUR FROM timestamp), EXTRACT(DOW FROM timestamp)`, aggregating AVG(views). SVG heatmap rendered as an Astro component on `chronology.astro`.

**Priority:** HIGH -- directly actionable for posting schedule optimization.

---

### Feature 6: Content Pillar ROI Quadrant

**What it shows:** A 2D scatter plot with X-axis = post volume (% of corpus) and Y-axis = average engagement per post. Each of the 20 tags is a labeled dot. Quadrant labels identify under-served opportunities ("Hidden Gems": low volume, high engagement) and over-invested topics ("Reconsider": high volume, low engagement).

**Data source:** `tags` + `metrics_latest`. All data exists.

**Implementation:** New API route `GET /api/tag-roi` computing per-tag median views and post count. React scatter plot component. New section on `taxonomy.astro`.

**Priority:** MEDIUM -- requires engagement data which is only available from April 2024 onward.

---

### Feature 7: Reply Sentiment Dashboard

**What it shows:** For each of the 20 tags, a stacked bar showing the sentiment distribution (positive/negative/neutral) of replies received. Surfaces which topics attract supportive vs. hostile audience responses.

**Data source:** `conversations.reply_text` + `tags` (joined via `conversations.root_post_id`). The conversations table exists but reply text may not be classified.

**Implementation:** New analysis script `scripts/analysis/reply-sentiment.mjs` that classifies `conversations.reply_text` using keyword sentiment (POSITIVE_WORDS, NEGATIVE_WORDS sets -- consistent with the existing approach in ByTheWeiCo). Store in a new `reply_sentiment` table. New section on `discourse.astro`.

**Priority:** MEDIUM -- requires the conversations table to be populated (depends on reply backfill script having been run).

---

### Feature 8: Vocabulary Novelty Timeline

**What it shows:** A line chart showing the number of first-time-used words (hapax legomena introduced that month) per month. Overlaid with cumulative vocabulary size. Reveals whether linguistic novelty is accelerating or plateauing.

**Data source:** Raw post text + timestamps. The Heaps' law analysis already computes vocabulary growth checkpoints but not monthly breakdowns.

**Implementation:** Extend `information-theory.mjs` to track first-occurrence month for each word. Output as `monthly_vocab_novelty` array in `post-tags.json`. SVG line chart on `chronology.astro`.

**Priority:** MEDIUM -- the Heaps' law analysis already demonstrates vocabulary growth, but monthly granularity would be more useful.

---

### Feature 9: Engagement Decay Half-Life by Topic

**What it shows:** For posts with multiple metric snapshots, a chart showing the average time to reach 50% of eventual total views, segmented by primary tag. Reveals which topics have "evergreen" staying power vs. which spike and die.

**Data source:** `metrics` table (time-series snapshots per post) + `tags`. The metrics table already stores multiple fetched_at timestamps per post.

**Implementation:** New analysis script that, for each post with 3+ metric snapshots, fits a simple exponential decay curve to the view count time series and estimates the half-life. Aggregate by tag. New API route `GET /api/decay-curves`. Visualization on a new "Engagement" page or added to `discourse.astro`.

**Priority:** MEDIUM -- depends on having enough multi-snapshot posts in the metrics table.

---

### Feature 10: Discourse Drift Detector (JSD Between Rolling Windows)

**What it shows:** Jensen-Shannon Divergence computed between consecutive 30-day rolling windows. Highlights "regime changes" in posting behavior -- moments where the topic distribution shifted significantly. Annotate peaks with likely causes (external events, personal shifts).

**Data source:** `posts.timestamp` + `tags.tag`. All data exists.

**Implementation:** Add `jsd(P, Q)` to `info-theory-lib.mjs` (symmetric KL divergence with mixture). Sliding-window computation in a new analysis function. Output as `drift_timeline` array. SVG line chart with annotated peaks on `chronology.astro`.

**Priority:** MEDIUM -- computationally straightforward, provides a narrative of intellectual evolution.

---

### Feature 11: Surprise Anomaly Alerts

**What it shows:** An automatically generated list of posts whose surprise score is more than 2 standard deviations above the mean for their primary tag. These are posts that are topically unexpected even within their own category -- a philosopher post that doesn't sound like philosophy, a tech post that doesn't use tech vocabulary.

**Data source:** `surprise_scores` + `tags`. All data exists.

**Implementation:** Per-tag z-score computation on surprise values. Filter to |z| > 2. Display as a ranked list on `discourse.astro` with post text, tag, and z-score.

**Priority:** LOW -- interesting for exploration but less actionable than engagement-based insights.

---

### Feature 12: Conversation Thread Depth Analysis

**What it shows:** Distribution of reply tree depths from the `conversations` table. How deep do conversations go? Which topics generate the longest discussion threads? Is @maybe_foucault's engagement with reply threads correlated with the post's initial surprise score?

**Data source:** `conversations.depth` + `conversations.root_post_id` + `tags`. All data exists.

**Implementation:** New API route `GET /api/conversation-depth` aggregating `MAX(depth)` per root post, joined with tags. SVG histogram + per-tag breakdown.

**Priority:** LOW -- depends on conversation data being populated.

---

### Feature 13: Writing Style Radar (Temporal)

**What it shows:** A radar/spider chart showing 6 writing style dimensions computed per quarter: (1) avg word count, (2) vocabulary diversity (type-token ratio), (3) question frequency, (4) profanity rate, (5) URL share rate, (6) quote ratio. Each quarter is a polygon. Animated playback shows how style evolves.

**Data source:** `posts` table (all fields needed exist). The ByTheWeiCo Chronology page spec already describes a "Linguistic Fingerprint" radar chart, but it is not yet implemented in this standalone project.

**Implementation:** Compute 6 metrics per quarter. SVG radar chart component. CSS animation for quarter-by-quarter playback.

**Priority:** LOW -- visually impressive but not analytically deep.

---

### Feature 14: Concept Emergence Timeline

**What it shows:** For each TF-IDF concept in the knowledge graph, the first date it appeared in the corpus and its frequency trajectory over time. Surfaces newly coined terms, borrowed vocabulary, and abandoned concepts.

**Data source:** `kg_nodes` (concept nodes) + raw post text + timestamps.

**Implementation:** For each concept node's label, find the first post containing that word. Plot frequency-over-time as sparklines. Surface on the Network page alongside the knowledge graph.

**Priority:** LOW -- requires scanning raw text for each concept, computationally heavier than other proposals.

---

## Part 6: Sentiment Analysis Integration via Keyword Search API

The Threads API provides `GET /{user-id}/threads_keyword_search?q={keyword}&media_type=TEXT` with a rate limit of 500 searches per 7-day rolling window. This is a powerful but constrained resource. Here is how it could be used.

### 6.1 Financial Sentiment Tracking

**Use case:** @maybe_foucault already has 784 finance-tagged posts. The keyword search API could sample external Threads posts about the same financial topics (SPY, NVDA, gold, crypto, inflation) and compare sentiment.

**Architecture:**
1. Maintain a `keyword_searches` table: `id, keyword, searched_at, result_count, results_json`.
2. Scheduled job (weekly, within rate limits): search for 20 financial keywords, 25 searches/week budget.
3. For each result batch, run the same regex classifier + keyword sentiment analysis used internally.
4. Store classified external posts in an `external_posts` table: `id, keyword, text, sentiment, surprise, fetched_at`.
5. Dashboard: compare your finance sentiment trajectory against the broader Threads finance conversation.

**Rate limit budget:** 500 searches / 7 days = ~71/day. Allocating 25/week to finance leaves plenty for other domains.

### 6.2 Brand Monitoring

**Use case:** Track mentions of topics that constitute the @maybe_foucault brand: "foucault", "biopolitics", "panopticon", "genealogy", "discourse analysis". See what other users are saying about these topics and whether their framing differs from yours.

**Architecture:**
1. Weekly searches for 10 brand-adjacent keywords (10 searches/week).
2. Compute word entropy on external posts discussing the same concepts. Compare vocabulary diversity.
3. Surface as a "How Others Discuss Your Topics" section on the Discourse page.
4. Track over time: is broader interest in these topics growing or shrinking?

### 6.3 Trend Detection

**Use case:** Identify emerging topics on Threads before they reach mainstream saturation.

**Architecture:**
1. Maintain a "trend watchlist" of 30-50 keywords across domains (tech, politics, culture, philosophy).
2. Weekly search: track result counts over time. A keyword whose result count is increasing week-over-week is an emerging trend.
3. Compare against your own posting: are you ahead of, behind, or aligned with the trend curve?
4. Alert system: flag keywords where external interest is growing but you haven't posted about the topic recently.

**Rate limit budget:** 50 keywords x 1 search/week = 50 searches/week. Well within the 500/7-day limit.

### 6.4 Proposed Architecture for External Search Integration

```
scripts/
  search/
    keyword-scheduler.mjs        # Manages rate limits, schedules searches
    keyword-watchlist.json        # 50 tracked keywords with domains
    external-classifier.mjs      # Same regex classifiers applied to external text

db/
  init.sql (additions):
    keyword_searches             # Search log: keyword, timestamp, result_count
    external_posts               # Sampled external posts: text, sentiment, tags
    trend_snapshots              # Weekly keyword volume snapshots

src/pages/
  trends.astro                   # New page: trend detection dashboard
  api/trends.ts                  # API route: keyword volume time series

Analysis pipeline:
  keyword-scheduler → Threads API → external_posts → external-classifier
  → trend_snapshots → trends.astro (build-time or SSR)
```

**Key constraint:** The 500/7-day limit means this is a sampling tool, not a firehose. Design for weekly batch processing, not real-time monitoring. Budget: 25 finance + 10 brand + 50 trend = 85 searches/week, well within the 500 limit (leaves 415 for ad-hoc exploration).

---

## Summary: Priority Ranking

| # | Feature | Priority | Effort | Impact |
|---|---------|----------|--------|--------|
| 1 | KL Divergence Timeline | HIGH | Low | Identifies voice deviation weeks |
| 2 | Surprise-Engagement Scatter | HIGH | Low | Answers "does originality pay?" |
| 3 | Topic Transition Sankey | HIGH | Medium | Visualizes data already computed but discarded |
| 4 | Monthly Perplexity Trend | HIGH | Medium | "Am I becoming predictable?" in one chart |
| 5 | Engagement Heatmap | HIGH | Low | Directly actionable posting schedule |
| 6 | Mutual Information (surfaces to UI) | HIGH | Low | Already computed in console, just save + render |
| 7 | Content Pillar ROI Quadrant | MEDIUM | Low | Volume vs. engagement for 20 tags |
| 8 | Reply Sentiment Dashboard | MEDIUM | Medium | Audience reaction analysis |
| 9 | Vocabulary Novelty Timeline | MEDIUM | Medium | Monthly new-word introduction rate |
| 10 | Engagement Decay Half-Life | MEDIUM | High | Evergreen vs. spike content identification |
| 11 | Discourse Drift Detector (JSD) | MEDIUM | Medium | Regime change detection |
| 12 | Surprise Anomaly Alerts | LOW | Low | Category-internal outlier detection |
| 13 | Conversation Thread Depth | LOW | Low | Reply tree structure analysis |
| 14 | Writing Style Radar | LOW | Medium | Visual but not deeply analytical |

**Immediate wins (HIGH priority, LOW effort):** Features 1, 2, 5, and 6 could all be implemented in a single session. They require no new data collection, no new tables, and minimal new code -- mostly SQL queries against existing tables and SVG rendering consistent with the current approach.

**Biggest conceptual addition:** The KL divergence timeline (Feature 1) and the JSD drift detector (Feature 11) together would transform the Chronology page from "when did I post?" into "when did I change?" -- which is a fundamentally more interesting question.
