/**
 * threads-adapter.mjs — Transform Threads API posts to unified event schema
 * Filters reposts, differentiates original posts from quotes.
 */

import crypto from 'node:crypto';

function hashId(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

// Normalize media_type to a simpler format label
function normalizeMediaFormat(mediaType) {
  switch (mediaType) {
    case 'TEXT_POST': return 'text';
    case 'IMAGE': return 'image';
    case 'VIDEO': return 'video';
    case 'CAROUSEL_ALBUM': return 'carousel';
    case 'AUDIO': return 'audio';
    default: return 'text';
  }
}

/**
 * Transform a single Threads post to unified event format
 */
export function transformPost(post) {
  const ts = new Date(post.timestamp).getTime();
  const tsIso = new Date(post.timestamp).toISOString();

  // Differentiate post types: reply > quote > original
  const isReply = post.is_reply === true;
  const isQuote = post.is_quote_post === true;
  const type = isReply ? 'social_reply' : isQuote ? 'social_quote' : 'social_post';

  // Engagement with fetched flag
  const metricsRaw = post.metrics || {};
  const fetched = metricsRaw._fetched === true || Object.keys(metricsRaw).length > 0;
  const engagement = {
    fetched,
    views:   fetched ? (metricsRaw.views   ?? null) : null,
    likes:   fetched ? (metricsRaw.likes   ?? null) : null,
    replies: fetched ? (metricsRaw.replies ?? null) : null,
    reposts: fetched ? (metricsRaw.reposts ?? null) : null,
    quotes:  fetched ? (metricsRaw.quotes  ?? null) : null,
  };

  // Media info
  const mediaType = post.media_type || 'TEXT_POST';
  const mediaFormat = normalizeMediaFormat(mediaType);
  const mediaCount = post.children?.data?.length || (post.media_url ? 1 : 0);

  return {
    event_id: `th-${hashId(post.id + post.timestamp)}`,
    ts,
    ts_iso: tsIso,
    source: 'threads',
    type,

    context: {
      focus_mode: '',
      weather: '',
      battery_pct: null,
      location: ''
    },

    health: {
      steps: null,
      heart_rate: null,
      hrv: null,
      env_decibels: null
    },

    payload: {
      platform: 'threads',
      post_id: post.id,
      post_text: post.text || '',
      post_variety: isReply ? 'reply' : isQuote ? 'quote' : 'original',
      media_type: mediaType,
      media_format: mediaFormat,
      media_count: mediaCount,
      media_url: post.media_url || null,
      thumbnail_url: post.thumbnail_url || null,
      permalink: post.permalink || '',
      shortcode: post.shortcode || '',
      username: post.username || 'maybe_foucault',
      engagement
    }
  };
}

/**
 * Transform all posts from posts.json — filters reposts and textless non-media
 */
export function transformAll(postsData) {
  if (!postsData?.posts) return [];
  return postsData.posts
    .filter(p => p.media_type !== 'REPOST_FACADE')        // drop reposts
    .filter(p => p.text || p.media_url)                    // drop empty non-media
    .map(transformPost);
}
