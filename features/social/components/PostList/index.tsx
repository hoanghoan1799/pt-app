"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BUTTON_SECONDARY, CARD } from "@/constants/styles";
import { PostCard } from "@/features/social/components/PostCard";
import { loadMorePostsAction } from "@/features/social/services/social-actions";
import type {
  PostPage,
  PostSource,
  PostView,
} from "@/features/social/types/social";
import { prefetchTriggerIndex } from "@/features/social/utils/post-rules";
import { describeErrorReference } from "@/utils/errors";

interface PostListProps {
  mode: "user" | "admin";
  source: PostSource;
  initial: PostPage;
  emptyText: string;
}

interface LoadError {
  message: string;
  reference?: string;
}

// The first page comes from the server; the next one loads on its own when
// the 7th post of the last loaded page scrolls into view (infinite scroll).
// A refresh after a post, edit or delete brings a new first page and resets it.
export const PostList = ({
  mode,
  source,
  initial,
  emptyText,
}: PostListProps) => {
  const [seen, setSeen] = useState(initial);
  const [extra, setExtra] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [lastPageStart, setLastPageStart] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const loading = useRef(false);
  const trigger = useRef<HTMLDivElement>(null);
  const shown = useRef(0);

  if (seen !== initial) {
    setSeen(initial);
    setExtra([]);
    setCursor(initial.nextCursor);
    setLastPageStart(0);
    setError(null);
  }
  const firstIds = new Set(initial.posts.map((post) => post.id));
  const posts = [
    ...initial.posts,
    ...extra.filter((post) => !firstIds.has(post.id)),
  ];
  const triggerIndex =
    cursor === null ? -1 : prefetchTriggerIndex(posts.length, lastPageStart);
  const triggerId = posts[triggerIndex]?.id ?? null;

  useEffect(() => {
    shown.current = posts.length;
  });

  const loadMore = useCallback(async () => {
    if (cursor === null || loading.current) {
      return;
    }
    loading.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadMorePostsAction(mode, source, cursor);

      if (result.status === "error") {
        setError({ message: result.message, reference: result.reference });
        return;
      }
      setLastPageStart(shown.current);
      setExtra((current) => {
        const known = new Set([
          ...initial.posts.map((post) => post.id),
          ...current.map((post) => post.id),
        ]);

        return [
          ...current,
          ...result.page.posts.filter((post) => !known.has(post.id)),
        ];
      });
      setCursor(result.page.nextCursor);
    } catch {
      setError({ message: "Không tải thêm được. Thử lại nhé." });
    } finally {
      loading.current = false;
      setIsLoading(false);
    }
  }, [cursor, initial.posts, mode, source]);

  useEffect(() => {
    const node = trigger.current;

    if (!node || triggerId === null || error !== null) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [error, loadMore, triggerId]);

  if (posts.length === 0) {
    return <p className={`${CARD} p-6 text-center text-muted`}>{emptyText}</p>;
  }
  return (
    <div className="space-y-3">
      {posts.map((post) =>
        post.id === triggerId ? (
          <div key={post.id} ref={trigger}>
            <PostCard post={post} mode={mode} />
          </div>
        ) : (
          <PostCard key={post.id} post={post} mode={mode} />
        ),
      )}
      {isLoading && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-2 text-sm text-muted"
        >
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Đang tải thêm bài viết...
        </p>
      )}
      {error && !isLoading && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-muted">
            {error.message}{" "}
            {error.reference && describeErrorReference(error.reference)}
          </p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className={`${BUTTON_SECONDARY} w-full`}
          >
            Thử lại
          </button>
        </div>
      )}
      {cursor === null && initial.nextCursor !== null && (
        <p className="py-2 text-center text-sm text-muted">
          Bạn đã xem hết bài viết.
        </p>
      )}
    </div>
  );
};
