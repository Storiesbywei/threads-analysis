export const STATIONS = [
  { id: 'signal',  path: '/',         label: 'SIGNAL',  number: '01', description: 'Particle galaxy of all posts' },
  { id: 'entropy', path: '/entropy',  label: 'ENTROPY', number: '02', description: 'Information Theory Observatory' },
  { id: 'nebula',  path: '/nebula',   label: 'NEBULA',  number: '03', description: 'UMAP scatter — 35K points' },
  { id: 'codex',   path: '/codex',    label: 'CODEX',   number: '04', description: 'Knowledge Graph — 1,638 nodes' },
  { id: 'census',  path: '/census',   label: 'CENSUS',  number: '05', description: 'Cluster grid — 390 clusters' },
  { id: 'palace',  path: '/palace',   label: 'PALACE',  number: '06', description: 'Palace Navigator' },
  { id: 'pulse',   path: '/pulse',    label: 'PULSE',   number: '07', description: 'Sentiment & Energy' },
  { id: 'network', path: '/network',  label: 'NETWORK', number: '08', description: 'Social graph' },
  { id: 'genesis', path: '/genesis',  label: 'GENESIS', number: '09', description: 'Topic evolution' },
  { id: 'rhythm',  path: '/rhythm',   label: 'RHYTHM',  number: '10', description: 'Temporal patterns' },
  { id: 'oracle',  path: '/oracle',   label: 'ORACLE',  number: '11', description: 'Haiku Oracle' },
  { id: 'digest',  path: '/digest',   label: 'DIGEST',  number: '12', description: 'Live digest & drift' },
] as const;

export type StationId = typeof STATIONS[number]['id'];
export type Station = typeof STATIONS[number];

export function getStationByPath(path: string): Station | undefined {
  return STATIONS.find(s => s.path === path);
}

export function getStationIndex(path: string): number {
  return STATIONS.findIndex(s => s.path === path);
}

export function getStationByIndex(index: number): Station {
  return STATIONS[((index % STATIONS.length) + STATIONS.length) % STATIONS.length]!;
}
