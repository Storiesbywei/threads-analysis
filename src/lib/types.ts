export interface AnalyzedPost {
  id: string;
  tags: string[];
  sub_tags: string[];
  primary_tag: string;
  surprise: number;
  word_count: number;
  is_quote: boolean;
  is_reply: boolean;
}

export interface CorpusStats {
  total_posts: number;
  total_words: number;
  vocabulary_size: number;
  character_entropy: number;
  word_entropy: number;
  bigram_entropy: number;
  conditional_entropy: number;
  zipf_exponent: number;
  tag_entropy: number;
}

export interface PostTagsData {
  generated_at: string;
  corpus_stats: CorpusStats;
  tag_distribution: Record<string, number>;
  sub_tag_distribution: Record<string, number>;
  category_entropies: Record<string, { entropy: number; normalized: number }>;
  posts: AnalyzedPost[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'tag' | 'sub_tag' | 'concept' | 'bridge';
  post_count: number;
  size: number;
  color: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'co_occurrence' | 'temporal' | 'hierarchy' | 'concept_link' | 'bridge_link';
  weight: number;
  count: number;
}

export interface KnowledgeGraphData {
  generated_at: string;
  metadata: {
    total_posts: number;
    tag_count: number;
    sub_tag_count: number;
    node_count: number;
    edge_count: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SyncLogEntry {
  id: number;
  started_at: string;
  finished_at: string | null;
  sync_type: string;
  posts_fetched: number;
  posts_new: number;
  errors: number;
  status: string;
}
