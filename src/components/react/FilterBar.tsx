import { useState, useEffect, type CSSProperties } from 'react';

export interface PostFilters {
  tag: string;
  from: string;
  to: string;
  surpriseMin: string;
  surpriseMax: string;
  variety: string;
  q: string;
  sort: string;
  order: string;
}

interface FilterBarProps {
  filters: PostFilters;
  onChange: (filters: PostFilters) => void;
  onApply: () => void;
}

interface TagOption {
  tag: string;
  count: number;
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '12px 16px',
    background: '#1c2128',
    border: '1px solid #30363d',
    borderRadius: '8px',
    marginBottom: '16px',
    alignItems: 'flex-end',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '0.65rem',
    fontWeight: 600,
    color: '#6e7681',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  select: {
    padding: '6px 10px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '0.8rem',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    outline: 'none',
    minWidth: '100px',
  },
  input: {
    padding: '6px 10px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '0.8rem',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    outline: 'none',
    width: '110px',
  },
  searchInput: {
    padding: '6px 10px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '0.8rem',
    fontFamily: "-apple-system, sans-serif",
    outline: 'none',
    width: '180px',
  },
  sliderGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  surpriseInput: {
    padding: '6px 6px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '0.75rem',
    fontFamily: "'SF Mono', monospace",
    outline: 'none',
    width: '60px',
    textAlign: 'center' as const,
  },
  applyBtn: {
    padding: '6px 16px',
    background: '#58a6ff',
    border: 'none',
    borderRadius: '6px',
    color: '#0d1117',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-end',
  },
  clearBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#8b949e',
    fontSize: '0.75rem',
    cursor: 'pointer',
    alignSelf: 'flex-end',
  },
};

const defaultFilters: PostFilters = {
  tag: '',
  from: '',
  to: '',
  surpriseMin: '',
  surpriseMax: '',
  variety: '',
  q: '',
  sort: 'timestamp',
  order: 'desc',
};

export default function FilterBar({ filters, onChange, onApply }: FilterBarProps) {
  const [tags, setTags] = useState<TagOption[]>([]);

  useEffect(() => {
    fetch('/api/tags')
      .then((r) => r.json())
      .then((data) => {
        if (data.tags) setTags(data.tags);
      })
      .catch(() => {});
  }, []);

  const update = (key: keyof PostFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const handleClear = () => {
    onChange({ ...defaultFilters });
    // Trigger search immediately after clearing
    setTimeout(onApply, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onApply();
  };

  return (
    <div style={styles.bar}>
      <div style={styles.group}>
        <span style={styles.label}>Tag</span>
        <select
          value={filters.tag}
          onChange={(e) => update('tag', e.target.value)}
          style={styles.select}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag} ({t.count})
            </option>
          ))}
        </select>
      </div>

      <div style={styles.group}>
        <span style={styles.label}>From</span>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => update('from', e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.group}>
        <span style={styles.label}>To</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => update('to', e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.group}>
        <span style={styles.label}>Surprise (bits)</span>
        <div style={styles.sliderGroup}>
          <input
            type="number"
            placeholder="min"
            value={filters.surpriseMin}
            onChange={(e) => update('surpriseMin', e.target.value)}
            onKeyDown={handleKeyDown}
            step="0.5"
            min="0"
            style={styles.surpriseInput}
          />
          <span style={{ color: '#6e7681', fontSize: '0.75rem' }}>-</span>
          <input
            type="number"
            placeholder="max"
            value={filters.surpriseMax}
            onChange={(e) => update('surpriseMax', e.target.value)}
            onKeyDown={handleKeyDown}
            step="0.5"
            min="0"
            style={styles.surpriseInput}
          />
        </div>
      </div>

      <div style={styles.group}>
        <span style={styles.label}>Variety</span>
        <select
          value={filters.variety}
          onChange={(e) => update('variety', e.target.value)}
          style={styles.select}
        >
          <option value="">All</option>
          <option value="original">Original</option>
          <option value="reply">Reply</option>
          <option value="quote">Quote</option>
          <option value="repost">Repost</option>
        </select>
      </div>

      <div style={styles.group}>
        <span style={styles.label}>Sort</span>
        <select
          value={filters.sort}
          onChange={(e) => update('sort', e.target.value)}
          style={styles.select}
        >
          <option value="timestamp">Date</option>
          <option value="surprise">Surprise</option>
          <option value="views">Views</option>
          <option value="likes">Likes</option>
          <option value="replies">Replies</option>
          <option value="word_count">Length</option>
        </select>
      </div>

      <div style={styles.group}>
        <span style={styles.label}>Search</span>
        <input
          type="text"
          placeholder="Full-text search..."
          value={filters.q}
          onChange={(e) => update('q', e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.searchInput}
        />
      </div>

      <button onClick={onApply} style={styles.applyBtn}>
        Search
      </button>
      <button onClick={handleClear} style={styles.clearBtn}>
        Clear
      </button>
    </div>
  );
}
