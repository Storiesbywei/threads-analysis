import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';

// ── Stats ──
export const useOverview = () =>
  useQuery({ queryKey: ['stats', 'overview'], queryFn: api.fetchOverview, staleTime: 60_000 });

export const useTags = () =>
  useQuery({ queryKey: ['stats', 'tags'], queryFn: api.fetchTags, staleTime: 120_000 });

export const useVelocity = () =>
  useQuery({ queryKey: ['stats', 'velocity'], queryFn: api.fetchVelocity, staleTime: 120_000 });

export const useStreak = () =>
  useQuery({ queryKey: ['stats', 'streak'], queryFn: api.fetchStreak, staleTime: 120_000 });

// ── Corpus (Information Theory) ──
export const useCorpus = () =>
  useQuery({ queryKey: ['stats', 'corpus'], queryFn: api.fetchCorpus, staleTime: 300_000 });

export const useCorpusHistory = () =>
  useQuery({ queryKey: ['stats', 'corpus', 'history'], queryFn: api.fetchCorpusHistory, staleTime: 300_000 });

// ── Posts ──
export const useLatest = (n = 10) =>
  useQuery({ queryKey: ['posts', 'latest', n], queryFn: () => api.fetchLatest(n), staleTime: 30_000 });

export const useSearch = (q: string) =>
  useQuery({ queryKey: ['posts', 'search', q], queryFn: () => api.fetchSearch(q), enabled: q.length > 0, staleTime: 60_000 });

// ── Analysis ──
export const useSentiment = (window = 'week', tag?: string) =>
  useQuery({ queryKey: ['analysis', 'sentiment', window, tag], queryFn: () => api.fetchSentiment(window, tag), staleTime: 120_000 });

export const useEnergy = (since?: string) =>
  useQuery({ queryKey: ['analysis', 'energy', since], queryFn: () => api.fetchEnergy(since), staleTime: 120_000 });

export const useIntent = (since?: string) =>
  useQuery({ queryKey: ['analysis', 'intent', since], queryFn: () => api.fetchIntent(since), staleTime: 120_000 });

export const useHourlyPattern = () =>
  useQuery({ queryKey: ['analysis', 'hours'], queryFn: api.fetchHourlyPattern, staleTime: 120_000 });

// ── Clusters ──
export const useClusters = (model = 'all-minilm') =>
  useQuery({ queryKey: ['clusters', model], queryFn: () => api.fetchClusters(model), staleTime: 300_000 });

export const useClusterSummary = (model = 'all-minilm') =>
  useQuery({ queryKey: ['clusters', 'summary', model], queryFn: () => api.fetchClusterSummary(model), staleTime: 300_000 });

// ── Mood / Vibe ──
export const useMood = () =>
  useQuery({ queryKey: ['mood'], queryFn: api.fetchMood, staleTime: 60_000 });

export const useVibe = () =>
  useQuery({ queryKey: ['vibe'], queryFn: api.fetchVibe, staleTime: 60_000 });

export const useDrift = () =>
  useQuery({ queryKey: ['drift'], queryFn: api.fetchDrift, staleTime: 300_000 });

// ── Knowledge Graph ──
export const useGraphTopics = () =>
  useQuery({ queryKey: ['graph', 'topics'], queryFn: api.fetchGraphTopics, staleTime: 300_000 });

// ── Social ──
export const useMentions = () =>
  useQuery({ queryKey: ['social', 'mentions'], queryFn: api.fetchMentions, staleTime: 300_000 });

export const useInteractions = () =>
  useQuery({ queryKey: ['social', 'interactions'], queryFn: api.fetchInteractions, staleTime: 300_000 });

// ── Genealogy ──
export const useGenealogyTopics = () =>
  useQuery({ queryKey: ['genealogy', 'topics'], queryFn: api.fetchGenealogyTopics, staleTime: 300_000 });

export const useGenealogyTimeline = (topic?: string) =>
  useQuery({ queryKey: ['genealogy', 'timeline', topic], queryFn: () => api.fetchGenealogyTimeline(topic), staleTime: 300_000 });

// ── Temporal ──
export const useHourly = () =>
  useQuery({ queryKey: ['stats', 'hourly'], queryFn: api.fetchHourly, staleTime: 120_000 });

export const useDaily = () =>
  useQuery({ queryKey: ['stats', 'daily'], queryFn: api.fetchDaily, staleTime: 120_000 });

// ── Haiku ──
export const useHaikuLatest = () =>
  useQuery({ queryKey: ['haiku', 'latest'], queryFn: api.fetchHaikuLatest, staleTime: 60_000 });

export const useHaikuAll = () =>
  useQuery({ queryKey: ['haiku', 'all'], queryFn: api.fetchHaikuAll, staleTime: 120_000 });

// ── Digest ──
export const useDigestToday = () =>
  useQuery({ queryKey: ['digest', 'today'], queryFn: api.fetchDigestToday, staleTime: 60_000 });

export const useDigestWeek = () =>
  useQuery({ queryKey: ['digest', 'week'], queryFn: api.fetchDigestWeek, staleTime: 300_000 });

export const useDigestBrief = () =>
  useQuery({ queryKey: ['digest', 'brief'], queryFn: api.fetchDigestBrief, staleTime: 60_000 });

// ── Bridges ──
export const useBridges = () =>
  useQuery({ queryKey: ['bridges'], queryFn: api.fetchBridges, staleTime: 300_000 });

// ── Who Am I ──
export const useWhoAmI = () =>
  useQuery({ queryKey: ['who-am-i'], queryFn: api.fetchWhoAmI, staleTime: 300_000 });

// ── Health ──
export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: api.fetchHealth, staleTime: 10_000, refetchInterval: 30_000 });
