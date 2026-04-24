import type {
  ApiResponse, PostsResponse, Overview, TagStat, VelocityData,
  HourlyStat, DailyStat, CorpusSnapshot, CorpusHistoryPoint,
  SentimentPoint, EnergyDist, IntentDist, HourlyPattern,
  ClustersResponse, ClusterSummary, PalaceResult, PalaceEdge,
  KGNode, KGRelated, MentionUser, InteractionUser,
  MoodData, VibeItem, DriftItem,
  GenealogyTopic, GenealogyTimeline, GenealogyConnection, Post,
  HaikuData, HaikuListItem, DigestToday, DigestWeek, WhoAmI,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4323`;

async function apiFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

// ── Stats ──
export const fetchOverview = () => apiFetch<ApiResponse<Overview>>('/stats/overview');
export const fetchTags = () => apiFetch<ApiResponse<TagStat[]>>('/stats/tags');
export const fetchVelocity = () => apiFetch<ApiResponse<VelocityData>>('/stats/velocity');
export const fetchHourly = () => apiFetch<ApiResponse<HourlyStat[]>>('/stats/hourly');
export const fetchDaily = () => apiFetch<ApiResponse<DailyStat[]>>('/stats/daily');
export const fetchStreak = () => apiFetch<ApiResponse<{ streak_days: number; last_post_date: string }>>('/stats/streak');

// ── Corpus (Information Theory) ──
export const fetchCorpus = () => apiFetch<ApiResponse<CorpusSnapshot>>('/stats/corpus');
export const fetchCorpusHistory = () => apiFetch<ApiResponse<CorpusHistoryPoint[]>>('/stats/corpus/history');

// ── Posts ──
export const fetchLatest = (n = 10) => apiFetch<PostsResponse>('/posts/latest', { n });
export const fetchSince = (minutes = 60) => apiFetch<PostsResponse>('/posts/since', { minutes });
export const fetchSearch = (q: string) => apiFetch<PostsResponse>('/posts/search', { q });
export const fetchByTag = (tag: string) => apiFetch<PostsResponse>(`/posts/tag/${tag}`);
export const fetchRandom = () => apiFetch<PostsResponse>('/posts/random');
export const fetchTopRecent = (days = 3, by = 'likes', n = 10) =>
  apiFetch<PostsResponse>('/stats/top/recent', { days, by, n });

// ── Analysis ──
export const fetchSentiment = (window = 'week', tag?: string) =>
  apiFetch<ApiResponse<SentimentPoint[]>>('/analysis/sentiment', { window, tag });
export const fetchEnergy = (since?: string) =>
  apiFetch<ApiResponse<EnergyDist[]>>('/analysis/energy', { since });
export const fetchIntent = (since?: string) =>
  apiFetch<ApiResponse<IntentDist[]>>('/analysis/intent', { since });
export const fetchHourlyPattern = () =>
  apiFetch<ApiResponse<HourlyPattern[]>>('/analysis/hours');

// ── Clusters ──
export const fetchClusters = (model = 'all-minilm') =>
  apiFetch<ClustersResponse>('/clusters', { model });
export const fetchClusterSummary = (model = 'all-minilm') =>
  apiFetch<ClusterSummary>('/clusters/summary', { model });

// ── Palace ──
export const fetchPalaceNavigate = (q: string, limit = 10) =>
  apiFetch<{ ok: true; query: string; data: PalaceResult[]; count: number }>('/palace/navigate', { q, limit });
export const fetchPalaceEdges = (type = 'relates_to', limit = 30) =>
  apiFetch<{ ok: true; type: string; data: PalaceEdge[] }>('/palace/edges', { type, limit });

// ── Knowledge Graph ──
export const fetchGraphTopics = () => apiFetch<ApiResponse<KGNode[]>>('/graph/topics');
export const fetchGraphRelated = (tag: string) =>
  apiFetch<ApiResponse<KGRelated[]>>(`/graph/related/${tag}`);

// ── Social ──
export const fetchMentions = () => apiFetch<ApiResponse<MentionUser[]>>('/social/mentions');
export const fetchInteractions = () => apiFetch<ApiResponse<InteractionUser[]>>('/social/interactions');

// ── Mood / Vibe / Drift ──
export const fetchMood = () => apiFetch<ApiResponse<MoodData>>('/mood');
export const fetchVibe = () => apiFetch<ApiResponse<VibeItem[]>>('/vibe/now');
export const fetchDrift = () => apiFetch<ApiResponse<DriftItem[]>>('/drift');

// ── Genealogy ──
export const fetchGenealogyTopics = () => apiFetch<ApiResponse<GenealogyTopic[]>>('/genealogy/topics');
export const fetchGenealogyTimeline = (topic?: string) =>
  apiFetch<ApiResponse<GenealogyTimeline[]>>('/genealogy/timeline', { topic });
export const fetchGenealogyConnections = (topic?: string) =>
  apiFetch<ApiResponse<GenealogyConnection[]>>('/genealogy/connections', { topic });
export const fetchGenealogyEvolution = (topic: string) =>
  apiFetch<ApiResponse<Post[]>>(`/genealogy/evolution`, { topic });

// ── Pedagogy ──
export const fetchPedagogyTopics = () => apiFetch<ApiResponse<GenealogyTopic[]>>('/pedagogy/topics');
export const fetchPedagogyTimeline = (topic?: string) =>
  apiFetch<ApiResponse<GenealogyTimeline[]>>('/pedagogy/timeline', { topic });

// ── Haiku ──
export const fetchHaikuLatest = () => apiFetch<ApiResponse<HaikuData>>('/haiku/latest');
export const fetchHaikuAll = () => apiFetch<ApiResponse<HaikuListItem[]>>('/haiku/all');

// ── Digest ──
export const fetchDigestToday = () => apiFetch<ApiResponse<DigestToday>>('/digest/today');
export const fetchDigestWeek = () => apiFetch<ApiResponse<DigestWeek>>('/digest/week');
export const fetchDigestBrief = () => apiFetch<ApiResponse<{ brief: string }>>('/digest/brief');

// ── Who Am I ──
export const fetchWhoAmI = () => apiFetch<ApiResponse<WhoAmI>>('/who-am-i');

// ── Bridges ──
export const fetchBridges = () => apiFetch<ApiResponse<Post[]>>('/bridges');

// ── Health ──
export const fetchHealth = () => apiFetch<{ status: string; db: string; generated_at: string }>('/health');
