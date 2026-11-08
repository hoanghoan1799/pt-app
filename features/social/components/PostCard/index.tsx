"use client";

import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { BottomSheet } from "@/components/common/BottomSheet";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { PhotoViewer } from "@/components/common/PhotoViewer";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  TEXTAREA,
} from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import {
  PRIVACY_ICONS,
  PrivacySelect,
} from "@/features/social/components/PrivacySelect";
import {
  CAPTION_MAX_LENGTH,
  PRIVACY_LABELS,
} from "@/features/social/constants/social";
import {
  deletePostAction,
  editPostAction,
} from "@/features/social/services/social-actions";
import type { PostPrivacy, PostView } from "@/features/social/types/social";
import {
  adminProfilePath,
  profilePath,
} from "@/features/social/utils/post-rules";
import { describeErrorReference } from "@/utils/errors";
import { formatRelativeTime } from "@/utils/time";

interface PostCardProps {
  post: PostView;
  mode: "user" | "admin";
}

const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-line/70";

export const PostCard = ({ post, mode }: PostCardProps) => {
  const router = useRouter();
  const confirm = useConfirm();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [privacy, setPrivacy] = useState<PostPrivacy>(post.privacy);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const PrivacyIcon = PRIVACY_ICONS[post.privacy];
  const href = (mode === "admin" ? adminProfilePath : profilePath)(
    post.authorKind,
    post.authorId,
  );
  const hasMenu = post.canEdit || post.canDelete;

  const report = (result: {
    status: string;
    message?: string;
    reference?: string;
  }) => {
    if (result.status === "error") {
      toast.error(result.message, {
        description: describeErrorReference(result.reference),
      });
      return false;
    }
    return true;
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await editPostAction(mode, {
        postId: post.id,
        caption,
        privacy,
      });

      if (report(result)) {
        setEditing(false);
        router.refresh();
      }
    });
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    const isConfirmed = await confirm({
      title: "Xóa bài viết này?",
      description: "Bài viết và ảnh đi kèm sẽ bị xóa vĩnh viễn.",
      confirmLabel: "Xóa",
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    startTransition(async () => {
      if (report(await deletePostAction(mode, post.id))) {
        router.refresh();
      }
    });
  };

  return (
    <article
      className={`${CARD} space-y-3 p-4`}
      aria-label={`Bài viết của ${post.authorName}`}
    >
      <header className="flex items-center gap-3">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar
            name={post.authorName}
            src={post.authorAvatarUrl}
            className="size-10 text-sm"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-semibold text-fg">
              <span className="truncate">{post.authorName}</span>
              {post.authorVerified && <VerifiedBadge />}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              {formatRelativeTime(post.createdAt, TIME_ZONE)}
              {post.edited && " · Đã chỉnh sửa"}
              <span aria-hidden>·</span>
              <PrivacyIcon className="size-3.5" aria-hidden />
              <span className="sr-only">{PRIVACY_LABELS[post.privacy]}</span>
            </span>
          </span>
        </Link>
        {hasMenu && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            disabled={isPending}
            aria-label="Tùy chọn bài viết"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-line disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-5" aria-hidden />
            )}
          </button>
        )}
      </header>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={caption}
            maxLength={CAPTION_MAX_LENGTH}
            onChange={(event) => setCaption(event.target.value)}
            aria-label="Nội dung bài viết"
            className={TEXTAREA}
          />
          <div className="flex items-center gap-2">
            <PrivacySelect
              id={`post-${post.id}-privacy`}
              value={privacy}
              onChange={setPrivacy}
              disabled={isPending}
            />
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setCaption(post.caption);
                setPrivacy(post.privacy);
              }}
              disabled={isPending}
              className={`${BUTTON_SECONDARY} ml-auto min-h-11`}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className={`${BUTTON_PRIMARY} min-h-11`}
            >
              Lưu
            </button>
          </div>
        </div>
      ) : (
        post.caption && (
          <p className="text-base break-words whitespace-pre-wrap text-fg">
            {post.caption}
          </p>
        )
      )}

      {post.photo && (
        <button
          type="button"
          onClick={() => setViewerIndex(0)}
          aria-label="Xem ảnh"
          className="block w-full overflow-hidden rounded-xl bg-line"
          style={{ aspectRatio: `${post.photo.width} / ${post.photo.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.photo.url}
            alt="Ảnh trong bài viết"
            width={post.photo.width}
            height={post.photo.height}
            loading="lazy"
            className="size-full object-cover"
          />
        </button>
      )}

      {post.photo && (
        <PhotoViewer
          photos={[
            {
              id: post.photo.id,
              src: post.photo.url,
              label: `Ảnh của ${post.authorName}`,
            },
          ]}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          fileNameFor={(photo, mime) =>
            `anh-${photo.id}.${mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp"}`
          }
        />
      )}

      <BottomSheet
        isOpen={isMenuOpen}
        onOpenChange={setMenuOpen}
        title="Tùy chọn bài viết"
      >
        <div className="space-y-1 pb-2">
          {post.canEdit && (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              <Pencil className="size-5" aria-hidden />
              Sửa
            </button>
          )}
          {post.canDelete && (
            <button
              type="button"
              className={`${MENU_ITEM} text-danger`}
              onClick={handleDelete}
            >
              <Trash2 className="size-5" aria-hidden />
              Xoá
            </button>
          )}
        </div>
      </BottomSheet>
    </article>
  );
};
