"use client";

import {
  Flag,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
import { replyPostHref } from "@/features/chat/utils/chat-links";
import {
  PRIVACY_ICONS,
  PrivacySelect,
} from "@/features/social/components/PrivacySelect";
import { ReactionBar } from "@/features/social/components/ReactionBar";
import { ReportSheet } from "@/features/social/components/ReportSheet";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import {
  CAPTION_MAX_LENGTH,
  PRIVACY_LABELS,
} from "@/features/social/constants/social";
import { openDmAction } from "@/features/social/services/dm-actions";
import {
  deletePostAction,
  editPostAction,
} from "@/features/social/services/social-actions";
import type { PostPrivacy, PostView } from "@/features/social/types/social";
import { dmReplyPath } from "@/features/social/utils/dm-rules";
import {
  adminPostPath,
  postPath,
} from "@/features/social/utils/engagement-rules";
import {
  adminProfilePath,
  profilePath,
} from "@/features/social/utils/post-rules";
import { describeErrorReference } from "@/utils/errors";
import { formatRelativeTime } from "@/utils/time";

interface PostCardProps {
  post: PostView;
  mode: "user" | "admin";
  // On the post page itself the comment count is not a link.
  isDetail?: boolean;
}

const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-line/70";

export const PostCard = ({ post, mode, isDetail = false }: PostCardProps) => {
  const router = useRouter();
  const confirm = useConfirm();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
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
  // Everyone can report a post that is not their own.
  const canReport = !post.canEdit;
  // Trainees reply to another trainee's post in their chat (the friendship is
  // checked when the chat opens and the error is shown) and to a PT's post in
  // the coach chat; a PT replies to a trainee's post in that trainee's chat.
  // The chat page itself drops the post when it cannot be quoted (locked chat,
  // post not visible).
  const isFriendReply =
    mode === "user" && post.authorKind === "user" && !post.canEdit;
  const canReplyInChat =
    isFriendReply ||
    (mode === "user" && post.authorKind === "admin" && !post.canEdit) ||
    (mode === "admin" && post.authorKind === "user");
  const hasMenu = post.canEdit || post.canDelete || canReport;

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

  const handleReplyInChat = () => {
    if (!isFriendReply) {
      router.push(
        mode === "admin"
          ? replyPostHref("admin", post.authorId, post.id)
          : replyPostHref("user", 0, post.id),
      );
      return;
    }
    startTransition(async () => {
      const result = await openDmAction(post.authorId);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      router.push(dmReplyPath(result.conversationId, post.id));
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

      <ReactionBar
        postId={post.id}
        mode={mode}
        reactions={post.reactions}
        commentCount={post.commentCount}
        detailHref={
          isDetail
            ? null
            : mode === "admin"
              ? adminPostPath(post.id)
              : postPath(post.id)
        }
      />

      {canReplyInChat && (
        <button
          type="button"
          onClick={handleReplyInChat}
          disabled={isPending}
          className={`${BUTTON_SECONDARY} min-h-11 w-full gap-2`}
        >
          {isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <MessageCircle className="size-5" aria-hidden />
          )}
          {DM_MESSAGES.REPLY_TO_POST}
        </button>
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
          {canReport && (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            >
              <Flag className="size-5" aria-hidden />
              Báo cáo
            </button>
          )}
        </div>
      </BottomSheet>
      {canReport && (
        <ReportSheet
          isOpen={isReportOpen}
          onOpenChange={setReportOpen}
          mode={mode}
          targetKind="post"
          targetId={post.id}
        />
      )}
    </article>
  );
};
