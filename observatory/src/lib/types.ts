// ── Generic API wrapper ──
export interface ApiResponse<T> {
  data: T;
  count: number;
  query: Record<string, unknown>;
  generated_at: string;
}

export interface PostsResponse {
  posts: Post[];
  count: number;
  query: Record<string, unknown>;
  generated_at: string;
}

// ── Post ──
export interface Post {
  id: string;
  text: string | null;
  timestamp: string;
  ago: string;
  variety: 'original' | 'reply' | 'quote' | 'repost';
  tags: string[];
  primary_tag: string | null;
  surprise: number | null;
  word_count: number | null;
  permalink: string | null;
  metrics: {
    views: number | null;
    likes: number | null;
    replies: number | null;
  };
}

// ── Stats ──
export interface Overview {
  total_posts: number;
  first_post: string;
  last_post: string;
  posts_today: number;
  posts_this_week: number;
  posts_this_month: number;
}

export interface TagStat {
  tag: string;
  count: number;
  percentage: number;
}

export interface VelocityData {
  last_7_days: number;
  last_30_days: number;
  last_90_days: number;
}

export interface HourlyStat {
  hour: number;
  count: number;
}

export interface DailyStat {
  day: string;
  count: number;
}

// ── Corpus Snapshots (Information Theory) ──
export interface CorpusSnapshot {
  total_posts: number;
  total_words: number;
  vocabulary_size: number;
  char_entropy: number;
  word_entropy: number;
  bigram_entropy: number;
  conditional_entropy: number;
  zipf_exponent: number;
  tag_entropy: number;
  heaps_exponent: number;
  topic_stay_rate: number;
  burst_rate: number;
  tag_distribution: Record<string, number>;
  sub_tag_distribution: Record<string, number>;
  category_entropies: Record<string, number>;
  computed_at: string;
}

export interface CorpusHistoryPoint {
  computed_at: string;
  total_posts: number;
  total_words: number;
  vocabulary_size: number;
  word_entropy: number;
  zipf_exponent: number;
  heaps_exponent: number;
  tag_entropy: number;
  topic_stay_rate: number;
  burst_rate: number;
}

// ── Analysis ──
export interface SentimentPoint {
  period: string;
  avg_sentiment: number;
  post_count: number;
}

export interface EnergyDist {
  energy: 'high' | 'mid' | 'low';
  count: number;
}

export interface IntentDist {
  intent: string;
  count: number;
}

export interface HourlyPattern {
  hour_bucket: string;
  count: number;
  avg_sentiment: number;
}

// ── Clusters ──
export interface ClusterInfo {
  cluster_id: number;
  name: string;
  description: string;
  size: number;
  avg_sentiment: number | null;
  dominant_energy: string | null;
  dominant_intent: string | null;
  date_start: string | null;
  date_end: string | null;
  centroid_x: number | null;
  centroid_y: number | null;
}

export interface ClusterSummary {
  ok: true;
  model: string;
  total_clusters: number;
  total_posts: number;
  top_5: Array<{
    name: string;
    size: number;
    sentiment: number | null;
    energy: string | null;
  }>;
}

export interface ClustersResponse {
  ok: true;
  model: string;
  data: ClusterInfo[];
  count: number;
}

// ── Palace ──
export interface PalaceResult {
  id: string;
  text: string;
  timestamp: string;
  sentiment: number | null;
  energy: string | null;
  intent: string | null;
  cluster_id: number;
  cluster_name: string | null;
}

export interface PalaceEdge {
  source: string;
  target: string;
  relationship: 'relates_to' | 'contains' | 'references' | 'contradicts' | 'evolves_to';
  weight: number;
}

// ── Knowledge Graph ──
export interface KGNode {
  id: string;
  label: string;
  node_type: string;
  post_count: number | null;
  size: number | null;
  connections: Array<{
    target: string;
    weight: number | null;
    type: string;
  }>;
}

export interface KGRelated {
  related_tag: string;
  weight: number | null;
  edge_type: string;
}

// ── Social ──
export interface MentionUser {
  username: string;
  mention_count: number;
}

export interface InteractionUser {
  reply_username: string;
  reply_count: number;
}

// ── Mood / Vibe ──
export interface MoodData {
  sentiment: number;
  mood: 'positive' | 'negative' | 'neutral';
  energy: 'high' | 'mid' | 'low';
  breakdown: { high: number; mid: number; low: number };
  posts_analyzed: number;
  brief: string;
}

export interface VibeItem {
  vibe: string;
  count: number;
  percentage: number;
}

export interface DriftItem {
  tag: string;
  this_month: number;
  last_month: number;
  delta: number;
}

// ── Genealogy ──
export interface GenealogyTopic {
  topic: string;
  mentions: number;
  first_mentioned: string;
  last_mentioned: string;
}

export interface GenealogyTimeline {
  month: string;
  topic: string;
  count: number;
}

export interface GenealogyConnection {
  source_topic: string;
  target_topic: string;
  co_occurrence_count: number;
  first_seen: string;
  last_seen: string;
}

// ── Haiku ──
export interface HaikuData {
  uuid: string;
  haiku: string;
  model: string;
  generated_at: string | null;
  sources: Array<{
    post_id: string;
    period: string;
    post_text: string;
    post_timestamp: string;
    ago: string;
  }>;
}

export interface HaikuListItem {
  uuid: string;
  haiku: string;
  model: string;
  generated_at: string;
  source_count: number;
}

// ── Digest ──
export interface DigestToday {
  date: string;
  total_posts: number;
  originals: number;
  replies: number;
  quotes: number;
  reposts: number;
  top_tags: Array<{ tag: string; count: number }>;
  top_post: Post | null;
}

export interface DigestWeek {
  period: string;
  total_posts: number;
  originals: number;
  replies: number;
  top_tags: Array<{ tag: string; count: number }>;
  daily_breakdown: Array<{ day: string; count: number }>;
}

// ── Who Am I ──
export interface WhoAmI {
  total_posts: number;
  date_range: { from: string; to: string };
  top_tags: Array<{ tag: string; count: number }>;
  sentiment: { mean: number | null; stddev: number | null };
  vibes: Array<{ vibe: string; count: number }>;
  energy: Array<{ energy: string; count: number }>;
  peak_hours: Array<{ hour_bucket: string; count: number }>;
  top_people: Array<{ to_username: string; count: number }>;
}

// ── Tag Colors (matching ByTheWeiCo palette) ──
export const TAG_COLORS: Record<string, string> = {
  philosophy: '#6b4c9a',
  tech: '#2d6b5a',
  personal: '#c17817',
  reaction: '#d4573b',
  'one-liner': '#8b6914',
  question: '#3b7dd4',
  media: '#9b3b8a',
  commentary: '#5a8a3b',
  finance: '#3bbf9e',
  'meta-social': '#bf6b3b',
  'daily-life': '#7a7a3b',
  work: '#4a6fa5',
  food: '#d49b3b',
  'url-share': '#5b8a8a',
  'sex-gender': '#c75b8a',
  race: '#8a5b3b',
  language: '#5b5bc7',
  political: '#c73b3b',
  creative: '#9b6bb5',
  unclassified: '#7a7a7a',
};
