import { TAG_COLORS } from '../../lib/colors';

interface TagInfo {
  tag: string;
  count: number;
  color: string;
}

interface TagLabelsProps {
  tags: TagInfo[];
  highlightedTag: string | null;
  onTagClick: (tag: string | null) => void;
}

export default function TagLabels({
  tags,
  highlightedTag,
  onTagClick,
}: TagLabelsProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 12,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
      }}
    >
      {/* Clear filter */}
      {highlightedTag && (
        <button
          onClick={() => onTagClick(null)}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
            marginBottom: 2,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          CLEAR
        </button>
      )}

      {tags.map(({ tag, count, color }) => {
        const isActive = highlightedTag === null || highlightedTag === tag;
        return (
          <button
            key={tag}
            onClick={() => onTagClick(highlightedTag === tag ? null : tag)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: highlightedTag === tag
                ? `${color}22`
                : 'rgba(13,13,14,0.7)',
              border: highlightedTag === tag
                ? `1px solid ${color}55`
                : '1px solid transparent',
              borderRadius: 10,
              color: isActive ? color : 'rgba(255,255,255,0.15)',
              cursor: 'pointer',
              padding: '2px 8px 2px 6px',
              fontSize: 9,
              fontFamily: 'monospace',
              letterSpacing: '0.03em',
              transition: 'all 0.15s',
              opacity: isActive ? 1 : 0.4,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.opacity = '0.7';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.opacity = '0.4';
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: color,
                opacity: isActive ? 1 : 0.3,
                flexShrink: 0,
              }}
            />
            <span>{tag}</span>
            <span
              style={{
                color: isActive
                  ? 'rgba(255,255,255,0.35)'
                  : 'rgba(255,255,255,0.1)',
                fontSize: 8,
              }}
            >
              {count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
