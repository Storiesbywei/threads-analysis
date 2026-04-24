import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import NudgeCard from '@/components/primitives/NudgeCard';
import { fetchPalaceNavigate } from '@/lib/api';
import type { PalaceResult } from '@/lib/types';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Search Input (right panel of NudgeCard) ──

function SearchPanel({ onSearch }: { onSearch: (q: string) => void }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) onSearch(input.trim());
  };

  return (
    <div style={{ padding: '36px 32px', width: '100%' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search the memory palace..."
          style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 16,
            padding: '14px 18px',
            border: '1.5px solid #D5D0C8',
            borderRadius: 3,
            background: '#fafaf8',
            color: '#111',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#FF5500')}
          onBlur={(e) => (e.target.style.borderColor = '#D5D0C8')}
        />
        <button
          type="submit"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '12px 24px',
            backgroundColor: '#FF5500',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Navigate
        </button>
      </form>
    </div>
  );
}

// ── Results Section ──

function ResultsSection({ query }: { query: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['palace', 'navigate', query],
    queryFn: () => fetchPalaceNavigate(query, 20),
    enabled: query.length > 0,
    staleTime: 60_000,
  });

  const results: PalaceResult[] = data?.data ?? [];

  if (!query) return null;

  return (
    <div style={{ padding: '36px 44px' }}>
      <span
        style={{
          display: 'inline-block',
          background: 'transparent',
          color: '#555',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          marginBottom: 20,
          border: '1.5px solid #D5D0C8',
          borderRadius: 3,
        }}
      >
        RESULTS
      </span>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          Searching...
        </div>
      ) : isError ? (
        <div style={{ fontSize: 13, color: '#C02820', fontFamily: "'Space Grotesk', sans-serif" }}>
          Search failed. Try again.
        </div>
      ) : results.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>
          No results found for &ldquo;{query}&rdquo;
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Result count */}
          <div
            style={{
              fontSize: 12,
              color: '#888',
              fontFamily: "'Share Tech Mono', monospace",
              marginBottom: 16,
            }}
          >
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </div>

          {results.map((result, i) => (
            <ResultRow key={result.id} result={result} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, rank }: { result: PalaceResult; rank: number }) {
  // Sentiment as a rough similarity indicator — the API returns cluster info
  const clusterLabel = result.cluster_name ?? `Cluster ${result.cluster_id}`;

  return (
    <div
      style={{
        padding: '20px 0',
        borderBottom: '1px solid #e5e5e3',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Rank + text */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <span
          style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12,
            color: '#888',
            minWidth: 28,
            flexShrink: 0,
          }}
        >
          {String(rank).padStart(2, '0')}
        </span>
        <div
          style={{
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.6,
            color: '#111',
            flex: 1,
          }}
        >
          {result.text}
        </div>
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 40 }}>
        {/* Cluster badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#555',
            padding: '3px 8px',
            border: '1px solid #D5D0C8',
            borderRadius: 2,
          }}
        >
          {clusterLabel}
        </span>

        {/* Energy */}
        {result.energy && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: result.energy === 'high' ? '#FF5500' : '#888',
            }}
          >
            {result.energy}
          </span>
        )}

        {/* Intent */}
        {result.intent && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#888',
            }}
          >
            {result.intent}
          </span>
        )}

        {/* Timestamp */}
        <span
          style={{
            fontSize: 10,
            fontFamily: "'Share Tech Mono', monospace",
            color: '#aaa',
            marginLeft: 'auto',
          }}
        >
          {new Date(result.timestamp).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// ── Page ──

export default function PalacePage() {
  const [query, setQuery] = useState('');

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <NudgeCard
        number="06"
        date={formatDate()}
        title="Palace"
        subtitle="Semantic search through the memory palace"
        tags={['SEMANTIC', 'SEARCH', 'MEMORY']}
        variant="default"
      >
        <SearchPanel onSearch={setQuery} />
      </NudgeCard>

      <ResultsSection query={query} />
    </div>
  );
}
