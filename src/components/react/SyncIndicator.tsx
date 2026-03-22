import { useState, useEffect } from 'react';

function ago(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface SyncStatus {
  last_sync?: string;
  status?: string;
  posts_fetched?: number;
}

export default function SyncIndicator() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/sync-status');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSyncStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const isOk = syncStatus?.status === 'completed' || syncStatus?.status === 'ok';
  const dotColor = error ? '#f85149' : isOk ? '#3fb950' : '#d29922';
  const label = error
    ? 'sync error'
    : syncStatus?.last_sync
      ? ago(syncStatus.last_sync)
      : 'loading...';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        color: '#8b949e',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: dotColor,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
