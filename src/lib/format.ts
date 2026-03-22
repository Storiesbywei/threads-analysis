export function num(n: number): string {
  return n.toLocaleString('en-US');
}

export function pct(n: number, total: number): string {
  return ((n / total) * 100).toFixed(1) + '%';
}

export function bits(n: number): string {
  return n.toFixed(3) + ' bits';
}

export function ago(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
