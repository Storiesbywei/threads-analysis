import { useState, useCallback, useEffect } from 'react';
import FilterBar, { type PostFilters } from './FilterBar';
import PostList from './PostList';

interface PostsResponse {
  posts: any[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 50;

export default function PostExplorer() {
  const [filters, setFilters] = useState<PostFilters>({
    tag: '',
    from: '',
    to: '',
    surpriseMin: '',
    surpriseMax: '',
    variety: '',
    q: '',
    sort: 'timestamp',
    order: 'desc',
  });
  const [data, setData] = useState<PostsResponse>({ posts: [], total: 0, page: 1, limit: LIMIT });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(LIMIT));
        params.set('sort', filters.sort);
        params.set('order', filters.order);

        if (filters.tag) params.set('tag', filters.tag);
        if (filters.from) params.set('from', filters.from);
        if (filters.to) params.set('to', filters.to);
        if (filters.surpriseMin) params.set('surprise_min', filters.surpriseMin);
        if (filters.surpriseMax) params.set('surprise_max', filters.surpriseMax);
        if (filters.variety) params.set('variety', filters.variety);
        if (filters.q) params.set('q', filters.q);

        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        console.error('PostExplorer fetch error:', msg);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Load initial posts
  useEffect(() => {
    fetchPosts(1);
  }, []);

  const handleApply = () => fetchPosts(1);
  const handlePageChange = (page: number) => fetchPosts(page);

  return (
    <div>
      <FilterBar filters={filters} onChange={setFilters} onApply={handleApply} />

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f8514920',
            border: '1px solid #f8514940',
            borderRadius: '8px',
            color: '#f85149',
            fontSize: '0.8rem',
            marginBottom: '12px',
          }}
        >
          Error: {error}
        </div>
      )}

      <PostList
        posts={data.posts}
        total={data.total}
        page={data.page}
        limit={data.limit}
        onPageChange={handlePageChange}
        loading={loading}
      />
    </div>
  );
}
