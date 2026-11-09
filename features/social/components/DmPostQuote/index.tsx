import clsx from "clsx";
import Link from "next/link";

import { Avatar } from "@/components/common/Avatar";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import type { DmReplyPostView } from "@/features/social/types/dm";
import {
  adminPostPath,
  postPath,
} from "@/features/social/utils/engagement-rules";

interface DmPostQuoteProps {
  post: DmReplyPostView;
  // "bubble": an embedded mini post (full caption and photo) linking to the
  // post. "bar": the compact preview above the composer.
  variant?: "bubble" | "bar";
  // Whose route the bubble opens: the post page of the trainee or admin app.
  mode?: "user" | "admin";
  className?: string;
}

// The quoted post of a reply. A post the viewer can no longer see is a muted
// placeholder that opens nothing.
export const DmPostQuote = ({
  post,
  variant = "bubble",
  mode = "user",
  className,
}: DmPostQuoteProps) => {
  if (!post.available) {
    return (
      <p
        className={clsx(
          "rounded-xl border border-line bg-bg/60 px-3 py-2 text-sm text-muted italic",
          className,
        )}
      >
        {DM_MESSAGES.POST_UNAVAILABLE}
      </p>
    );
  }
  if (variant === "bar") {
    return (
      <div
        className={clsx(
          "flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5",
          className,
        )}
      >
        {post.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.photo.url}
            alt=""
            className="size-10 shrink-0 rounded-lg bg-line object-cover"
          />
        )}
        <span className="min-w-0 flex-1 border-l-2 border-accent pl-2 text-left">
          <span className="block truncate text-xs font-semibold text-accent">
            {post.authorName}
          </span>
          {post.caption && (
            <span className="line-clamp-2 text-sm text-muted">
              {post.caption}
            </span>
          )}
        </span>
      </div>
    );
  }
  return (
    <Link
      href={(mode === "admin" ? adminPostPath : postPath)(post.id)}
      aria-label={`Bài viết của ${post.authorName}`}
      className={clsx(
        "block space-y-2 overflow-hidden rounded-xl border border-line bg-surface p-2 text-left text-fg",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Avatar
          name={post.authorName}
          src={post.authorAvatarUrl}
          className="size-6 text-xs"
        />
        <span className="truncate text-sm font-semibold">
          {post.authorName}
        </span>
      </span>
      {post.caption && (
        <span className="line-clamp-[12] block text-sm break-words whitespace-pre-wrap">
          {post.caption}
        </span>
      )}
      {post.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.photo.url}
          alt="Ảnh trong bài viết"
          width={post.photo.width}
          height={post.photo.height}
          loading="lazy"
          className="w-full rounded-lg bg-line object-cover"
          style={{ aspectRatio: `${post.photo.width} / ${post.photo.height}` }}
        />
      )}
    </Link>
  );
};
