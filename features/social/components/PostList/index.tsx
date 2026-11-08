"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BUTTON_SECONDARY, CARD } from "@/constants/styles";
import { PostCard } from "@/features/social/components/PostCard";
import { loadMorePostsAction } from "@/features/social/services/social-actions";
import type {
  PostPage,
  PostSource,
  PostView,
} from "@/features/social/types/social";
import { describeErrorReference } from "@/utils/errors";

interface PostListProps {
  mode: "user" | "admin";
  source: PostSource;
  initial: PostPage;
  emptyText: string;
}

// The first page comes from the server; "Xem thêm" appends the next ones. A
// refresh after a post, edit or delete brings a new first page and resets it.
export const PostList = ({
  mode,
  source,
  initial,
  emptyText,
}: PostListProps) => {
  const [seen, setSeen] = useState(initial);
  const [extra, setExtra] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [isPending, startTransition] = useTransition();

  if (seen !== initial) {
    setSeen(initial);
    setExtra([]);
    setCursor(initial.nextCursor);
  }
  const firstIds = new Set(initial.posts.map((post) => post.id));
  const posts = [
    ...initial.posts,
    ...extra.filter((post) => !firstIds.has(post.id)),
  ];

  const handleMore = () => {
    if (cursor === null) {
      return;
    }
    startTransition(async () => {
      const result = await loadMorePostsAction(mode, source, cursor);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      setExtra((current) => [...current, ...result.page.posts]);
      setCursor(result.page.nextCursor);
    });
  };

  if (posts.length === 0) {
    return <p className={`${CARD} p-6 text-center text-muted`}>{emptyText}</p>;
  }
  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} mode={mode} />
      ))}
      {cursor !== null && (
        <button
          type="button"
          onClick={handleMore}
          disabled={isPending}
          className={`${BUTTON_SECONDARY} w-full`}
        >
          {isPending && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Xem thêm
        </button>
      )}
    </div>
  );
};
