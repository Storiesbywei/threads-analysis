import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import NudgeCard from "@/components/primitives/NudgeCard";
import T1000Browser from "@/components/primitives/T1000Browser";
import type { T1000Item, T1000Row } from "@/components/primitives/T1000Browser";
import SK4Reader from "@/components/primitives/SK4Reader";
import { useOverview, useVelocity, useStreak, useTags } from "@/hooks/useApi";
import { fetchByTag } from "@/lib/api";
import type { Post, TagStat } from "@/lib/types";
import { TAG_COLORS } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatDate(): string {
  const d = new Date();
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function truncateWords(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

// ── Signal Station (01) ─────────────────────────────────────────

export default function SignalPage() {
  const overview = useOverview();
  const velocity = useVelocity();
  const streak = useStreak();
  const tags = useTags();

  const [activeTag, setActiveTag] = useState("philosophy");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [sortMode, setSortMode] = useState("views");
  const [compact, setCompact] = useState(false);

  const t1000Ref = useRef<HTMLDivElement>(null);

  // Fetch posts for the active tag
  const tagPosts = useQuery({
    queryKey: ["posts", "tag", activeTag],
    queryFn: () => fetchByTag(activeTag),
    staleTime: 60_000,
  });

  // ── Derived data ──

  const totalPosts = overview.data?.data.total_posts ?? 0;
  const postsToday = overview.data?.data.posts_today ?? 0;
  const streakDays = streak.data?.data.streak_days ?? 0;
  const vel7 = velocity.data?.data.last_7_days ?? 0;

  const tagItems: T1000Item[] = useMemo(() => {
    if (!tags.data?.data) return [];
    return tags.data.data.map((t: TagStat) => ({
      id: t.tag,
      label: t.tag,
      count: t.count,
      color: TAG_COLORS[t.tag],
    }));
  }, [tags.data]);

  // Sort posts based on current sort mode
  const sortedPosts = useMemo(() => {
    const posts = tagPosts.data?.posts ?? [];
    const copy = [...posts];
    switch (sortMode) {
      case "views":
        return copy.sort(
          (a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0),
        );
      case "likes":
        return copy.sort(
          (a, b) => (b.metrics.likes ?? 0) - (a.metrics.likes ?? 0),
        );
      case "date":
        return copy.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      default:
        return copy;
    }
  }, [tagPosts.data, sortMode]);

  const rows: T1000Row[] = useMemo(
    () =>
      sortedPosts.map((p) => ({
        id: p.id,
        text: p.text ?? "",
        meta: p.ago,
        value: p.metrics.views ? formatCount(p.metrics.views) : undefined,
        isActive: selectedPost?.id === p.id,
      })),
    [sortedPosts, selectedPost],
  );

  // ── Tag frequency bars for SK4Reader ──

  const tagBars = useMemo(() => {
    if (!tags.data?.data) return [];
    const sorted = [...tags.data.data].sort((a, b) => b.count - a.count);
    const top8 = sorted.slice(0, 8);
    const maxVal = top8[0]?.count ?? 1;
    return top8.map((t) => ({
      label: t.tag,
      value: t.count,
      maxValue: maxVal,
      color: TAG_COLORS[t.tag],
    }));
  }, [tags.data]);

  // ── SK4 navigation within current tag posts ──

  const currentPostIndex = useMemo(() => {
    if (!selectedPost) return -1;
    return sortedPosts.findIndex((p) => p.id === selectedPost.id);
  }, [selectedPost, sortedPosts]);

  const handlePrev = useCallback(() => {
    if (currentPostIndex > 0) {
      setSelectedPost(sortedPosts[currentPostIndex - 1]!);
    }
  }, [currentPostIndex, sortedPosts]);

  const handleNext = useCallback(() => {
    if (currentPostIndex < sortedPosts.length - 1) {
      setSelectedPost(sortedPosts[currentPostIndex + 1]!);
    }
  }, [currentPostIndex, sortedPosts]);

  const handleRandom = useCallback(() => {
    if (sortedPosts.length === 0) return;
    const idx = Math.floor(Math.random() * sortedPosts.length);
    setSelectedPost(sortedPosts[idx]!);
  }, [sortedPosts]);

  const handleEject = useCallback(() => {
    setSelectedPost(null);
  }, []);

  const handleDotClick = useCallback(
    (index: number) => {
      if (sortedPosts[index]) {
        setSelectedPost(sortedPosts[index]!);
      }
    },
    [sortedPosts],
  );

  // ── Scroll to T1000 ──

  const scrollToT1000 = useCallback(() => {
    t1000Ref.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Row click ──

  const handleRowClick = useCallback(
    (id: string) => {
      const post = sortedPosts.find((p) => p.id === id);
      if (post) setSelectedPost(post);
    },
    [sortedPosts],
  );

  // ── Tag select ──

  const handleTagSelect = useCallback((id: string) => {
    setActiveTag(id);
    setSelectedPost(null);
  }, []);

  // ── Subtitle text ──

  const subtitle = overview.isLoading
    ? "Loading observatory data..."
    : `${formatCount(totalPosts)} posts across ${tagItems.length || 20} tags, ${vel7} posts/day this week`;

  // ── Active tag count ──

  const activeTagStat = tagItems.find((t) => t.id === activeTag);
  const activeTagCount = tagPosts.data?.count ?? activeTagStat?.count ?? 0;

  // ── SK4 disc label ──

  const discTitle = selectedPost?.text
    ? truncateWords(selectedPost.text.split(/\s+/).slice(0, 3).join(" "), 18)
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* ── Section 1: NudgeCard Hero ── */}
      <NudgeCard
        number="01"
        date={formatDate()}
        title="Signal"
        subtitle={subtitle}
        tags={["OVERVIEW", "LIVE DATA"]}
        variant="accent"
        linkText="EXPLORE TAGS \u2193"
        onLinkClick={scrollToT1000}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            padding: "32px 40px",
            fontFamily: "'Courier New', monospace",
          }}
        >
          <StatBlock
            value={overview.isLoading ? "---" : formatCount(totalPosts)}
            label="total posts"
          />
          <StatBlock
            value={streak.isLoading ? "---" : String(streakDays)}
            label="streak days"
          />
          <StatBlock
            value={overview.isLoading ? "---" : String(postsToday)}
            label="posts today"
          />
        </div>
      </NudgeCard>

      {/* ── Section 2: T1000Browser (tag browser) ── */}
      <div ref={t1000Ref}>
        <T1000Browser
          items={tagItems}
          activeItemId={activeTag}
          onItemSelect={handleTagSelect}
          rows={rows}
          onRowClick={handleRowClick}
          headerLabel={activeTag}
          headerTag={activeTag.toUpperCase()}
          headerCount={`${activeTagCount} posts`}
          sortOptions={["views", "likes", "date"]}
          activeSort={sortMode}
          onSortChange={setSortMode}
          compact={compact}
          onCompactToggle={() => setCompact((c) => !c)}
          height={420}
        />
      </div>

      {/* ── Section 3: SK4Reader (post detail) ── */}
      {selectedPost && (
        <SK4Reader
          lidLabel="Now reading"
          lidValue={selectedPost.primary_tag ?? undefined}
          lidMeta={`${currentPostIndex + 1} / ${sortedPosts.length}`}
          lidDate={selectedPost.ago}
          isActive
          discTitle={discTitle}
          discSubtitle={selectedPost.primary_tag ?? undefined}
          discColor={
            selectedPost.primary_tag
              ? TAG_COLORS[selectedPost.primary_tag] ?? "#CC3322"
              : "#CC3322"
          }
          spinning
          content={
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {selectedPost.text ?? ""}
            </p>
          }
          meta={[
            selectedPost.metrics.views != null
              ? `${formatCount(selectedPost.metrics.views)} views`
              : null,
            selectedPost.metrics.likes != null
              ? `${formatCount(selectedPost.metrics.likes)} likes`
              : null,
            selectedPost.ago,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")}
          bars={tagBars}
          barsTitle="Tag frequency"
          onPrev={currentPostIndex > 0 ? handlePrev : undefined}
          onNext={
            currentPostIndex < sortedPosts.length - 1 ? handleNext : undefined
          }
          onRandom={sortedPosts.length > 1 ? handleRandom : undefined}
          onEject={handleEject}
          onOpen={
            selectedPost.permalink
              ? () => window.open(selectedPost.permalink!, "_blank")
              : undefined
          }
          totalItems={Math.min(sortedPosts.length, 20)}
          currentIndex={Math.min(currentPostIndex, 19)}
          onDotClick={handleDotClick}
        />
      )}
    </div>
  );
}

// ── StatBlock sub-component ─────────────────────────────────────

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          lineHeight: 1,
          color: "#3d1500",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#3d1500",
          opacity: 0.7,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
