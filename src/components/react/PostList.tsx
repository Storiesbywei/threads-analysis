import { useState, type CSSProperties } from 'react';

const TAG_COLORS: Record<string, string> = {
  'reaction': '#d4a04a', 'one-liner': '#a08030', 'tech': '#4db89a', 'media': '#9a6abf',
  'question': '#6d8ec4', 'personal': '#c47a4a', 'philosophy': '#ab6acf', 'daily-life': '#7aa771',
  'political': '#c44040', 'finance': '#4a8ac4', 'shitpost': '#c46a3a', 'food': '#9ec46a',
  'race': '#c44a4a', 'meta-social': '#a89060', 'sex-gender': '#c46aaa', 'language': '#5aaa8a',
  'commentary': '#8a8a5a', 'work': '#5a8aaa', 'creative': '#ba5aaa', 'url-share': '#8aaa5a',
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag] || '#6e7681';
}

function num(n: number): string {
  return n != null ? n.toLocaleString('en-US') : '-';
}

function ago(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface Post {
  id: string;
  text: string;
  timestamp: string;
  variety: string;
  word_count: number;
  primary_tag: string;
  tags: string[];
  sub_tags: string[];
  surprise: number;
  avg_surprise: number;
  views: number | null;
  likes: number | null;
  reply_count: number | null;
  reposts: number | null;
  permalink: string;
}

interface PostListProps {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  loading: boolean;
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  summary: {
    fontSize: '0.75rem',
    color: '#6e7681',
    fontFamily: "'SF Mono', monospace",
    marginBottom: '4px',
  },
  postCard: {
    background: '#1c2128',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  postHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    gap: '12px',
  },
  postText: {
    fontSize: '0.875rem',
    color: '#e6edf3',
    lineHeight: '1.5',
    wordBreak: 'break-word' as const,
  },
  postMeta: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    marginTop: '10px',
    flexWrap: 'wrap',
  },
  metaItem: {
    fontSize: '0.7rem',
    color: '#6e7681',
    fontFamily: "'SF Mono', monospace",
  },
  tagPill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.65rem',
    fontWeight: 500,
    marginRight: '4px',
    marginBottom: '4px',
    whiteSpace: 'nowrap' as const,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px',
    alignItems: 'center',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
    padding: '12px',
  },
  pageBtn: {
    padding: '6px 14px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: "'SF Mono', monospace",
  },
  pageBtnDisabled: {
    padding: '6px 14px',
    background: '#161b22',
    border: '1px solid #21262d',
    borderRadius: '6px',
    color: '#30363d',
    fontSize: '0.8rem',
    cursor: 'default',
    fontFamily: "'SF Mono', monospace",
  },
  pageInfo: {
    fontSize: '0.75rem',
    color: '#8b949e',
    fontFamily: "'SF Mono', monospace",
    minWidth: '100px',
    textAlign: 'center' as const,
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center' as const,
    color: '#6e7681',
    fontSize: '0.875rem',
  },
  loadingState: {
    padding: '48px 24px',
    textAlign: 'center' as const,
    color: '#8b949e',
    fontSize: '0.875rem',
  },
  varietyBadge: {
    fontSize: '0.6rem',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  permalink: {
    fontSize: '0.7rem',
    color: '#58a6ff',
    textDecoration: 'none',
    marginLeft: 'auto',
  },
};

function varietyStyle(variety: string): CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    original: { bg: '#3fb95020', fg: '#3fb950' },
    reply: { bg: '#58a6ff20', fg: '#58a6ff' },
    quote: { bg: '#ab6acf20', fg: '#ab6acf' },
    repost: { bg: '#d2992220', fg: '#d29922' },
  };
  const c = colors[variety] || { bg: '#30363d', fg: '#8b949e' };
  return { ...styles.varietyBadge, background: c.bg, color: c.fg };
}

export default function PostList({ posts, total, page, limit, onPageChange, loading }: PostListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div style={styles.loadingState}>Loading posts...</div>;
  }

  if (posts.length === 0) {
    return <div style={styles.emptyState}>No posts found matching your filters.</div>;
  }

  const totalPages = Math.ceil(total / limit);
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div style={styles.container}>
      <div style={styles.summary}>
        Showing {num(startItem)}-{num(endItem)} of {num(total)} posts
      </div>

      {posts.map((post) => {
        const isExpanded = expandedId === post.id;
        const textDisplay =
          isExpanded || !post.text || post.text.length <= 200
            ? post.text || ''
            : post.text.slice(0, 200) + '...';
        const surprise = post.avg_surprise ?? post.surprise;

        return (
          <div
            key={post.id}
            style={{
              ...styles.postCard,
              borderColor: isExpanded ? '#58a6ff' : '#30363d',
            }}
            onClick={() => setExpandedId(isExpanded ? null : post.id)}
          >
            <div style={styles.postHeader}>
              <div style={styles.tagsContainer}>
                {post.primary_tag && (
                  <span
                    style={{
                      ...styles.tagPill,
                      background: tagColor(post.primary_tag) + '22',
                      color: tagColor(post.primary_tag),
                    }}
                  >
                    {post.primary_tag}
                  </span>
                )}
                {isExpanded &&
                  post.tags
                    ?.filter((t: string) => t !== post.primary_tag)
                    .map((t: string) => (
                      <span
                        key={t}
                        style={{
                          ...styles.tagPill,
                          background: tagColor(t) + '15',
                          color: tagColor(t),
                          opacity: 0.8,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                {isExpanded &&
                  post.sub_tags?.map((st: string) => (
                    <span
                      key={st}
                      style={{
                        ...styles.tagPill,
                        background: '#30363d',
                        color: '#8b949e',
                        fontSize: '0.6rem',
                      }}
                    >
                      {st}
                    </span>
                  ))}
              </div>
              <span style={varietyStyle(post.variety)}>{post.variety}</span>
            </div>

            <div style={styles.postText}>{textDisplay}</div>

            <div style={styles.postMeta}>
              <span style={styles.metaItem}>{ago(post.timestamp)}</span>
              {surprise > 0 && (
                <span style={styles.metaItem}>
                  {surprise.toFixed(2)} bits
                </span>
              )}
              {post.word_count > 0 && (
                <span style={styles.metaItem}>{post.word_count}w</span>
              )}
              {post.views != null && (
                <span style={styles.metaItem}>{num(post.views)} views</span>
              )}
              {post.likes != null && post.likes > 0 && (
                <span style={styles.metaItem}>{num(post.likes)} likes</span>
              )}
              {post.reply_count != null && post.reply_count > 0 && (
                <span style={styles.metaItem}>{num(post.reply_count)} replies</span>
              )}
              {post.permalink && (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.permalink}
                  onClick={(e) => e.stopPropagation()}
                >
                  view
                </a>
              )}
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            style={page <= 1 ? styles.pageBtnDisabled : styles.pageBtn}
          >
            first
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            style={page <= 1 ? styles.pageBtnDisabled : styles.pageBtn}
          >
            prev
          </button>
          <span style={styles.pageInfo}>
            {page} / {num(totalPages)}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            style={page >= totalPages ? styles.pageBtnDisabled : styles.pageBtn}
          >
            next
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            style={page >= totalPages ? styles.pageBtnDisabled : styles.pageBtn}
          >
            last
          </button>
        </div>
      )}
    </div>
  );
}
