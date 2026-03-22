import { useState, type CSSProperties } from 'react';

const EDGE_TYPES = [
  { key: 'co_occurrence', label: 'Co-occurrence' },
  { key: 'temporal', label: 'Temporal' },
  { key: 'hierarchy', label: 'Hierarchy' },
  { key: 'concept_link', label: 'Concept Link' },
  { key: 'bridge_link', label: 'Bridge Link' },
] as const;

const NODE_TYPES = [
  { key: 'tag', label: 'Tags' },
  { key: 'sub_tag', label: 'Sub-tags' },
  { key: 'concept', label: 'Concepts' },
  { key: 'bridge', label: 'Bridges' },
] as const;

export interface GraphFilters {
  edgeTypes: Set<string>;
  nodeTypes: Set<string>;
  searchQuery: string;
  minWeight: number;
}

interface GraphControlsProps {
  filters: GraphFilters;
  onChange: (filters: GraphFilters) => void;
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    padding: '12px 16px',
    background: '#1c2128',
    border: '1px solid #30363d',
    borderRadius: '8px',
    marginBottom: '12px',
    alignItems: 'flex-start',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '120px',
  },
  groupLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#6e7681',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    color: '#8b949e',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#58a6ff',
    cursor: 'pointer',
  },
  searchInput: {
    padding: '6px 10px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '0.8rem',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    outline: 'none',
    width: '160px',
  },
  sliderContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  slider: {
    accentColor: '#58a6ff',
    width: '120px',
    cursor: 'pointer',
  },
  sliderValue: {
    fontSize: '0.7rem',
    color: '#6e7681',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
};

export default function GraphControls({ filters, onChange }: GraphControlsProps) {
  const toggleEdgeType = (type: string) => {
    const next = new Set(filters.edgeTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange({ ...filters, edgeTypes: next });
  };

  const toggleNodeType = (type: string) => {
    const next = new Set(filters.nodeTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange({ ...filters, nodeTypes: next });
  };

  return (
    <div style={styles.container}>
      <div style={styles.group}>
        <span style={styles.groupLabel}>Edge Types</span>
        {EDGE_TYPES.map(({ key, label }) => (
          <label key={key} style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={filters.edgeTypes.has(key)}
              onChange={() => toggleEdgeType(key)}
              style={styles.checkbox}
            />
            {label}
          </label>
        ))}
      </div>

      <div style={styles.group}>
        <span style={styles.groupLabel}>Node Types</span>
        {NODE_TYPES.map(({ key, label }) => (
          <label key={key} style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={filters.nodeTypes.has(key)}
              onChange={() => toggleNodeType(key)}
              style={styles.checkbox}
            />
            {label}
          </label>
        ))}
      </div>

      <div style={styles.group}>
        <span style={styles.groupLabel}>Search</span>
        <input
          type="text"
          placeholder="Find node..."
          value={filters.searchQuery}
          onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
          style={styles.searchInput}
        />
      </div>

      <div style={styles.group}>
        <span style={styles.groupLabel}>Min Weight</span>
        <div style={styles.sliderContainer as CSSProperties}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={filters.minWeight}
            onChange={(e) => onChange({ ...filters, minWeight: parseFloat(e.target.value) })}
            style={styles.slider}
          />
          <span style={styles.sliderValue}>{filters.minWeight.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
