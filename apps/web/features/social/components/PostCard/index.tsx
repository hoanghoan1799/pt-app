"use client";

import clsx from "clsx";
import { Flag, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { BottomSheet } from "@/components/common/BottomSheet";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { LazyPhotoViewer } from "@/components/common/LazyPhotoViewer";
import { Spinner } from "@/components/common/Spinner";
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
import { CAPTION_MAX_LENGTH } from "@/features/social/constants/social";
import {
  deletePostAction,
  editPostAction,
} from "@/features/social/services/social-actions";
import type { PostPrivacy, PostView } from "@/features/social/types/social";
import {
  adminPostPath,
  postPath,
} from "@/features/social/utils/engagement-rules";
import {
  adminProfilePath,
  profilePath,
} from "@/features/social/utils/post-rules";
import { useHasOpened } from "@/hooks/use-has-opened";
import { describeErrorReference } from "@/utils/errors";
import { formatRelativeTime } from "@/utils/time";

interface PostCardProps {
  post: PostView;
  mode: "user" | "admin";
  // On the post page itself the comment count is not a link.
  isDetail?: boolean;
}

// Opened from a menu item, so its code loads on first open.
const ReportSheet = dynamic(
  () =>
    import("@/features/social/components/ReportSheet").then(
      (module) => module.ReportSheet,
    ),
  { ssr: false },
);

// Feed rows below the fold skip layout and paint (content-visibility: auto).
// "auto <px>" in contain-intrinsic-size is only the first guess: once a card
// has been on screen the browser remembers its real height, so the scroll
// position does not shift when it is skipped again. Not used on the post page,
// where the card is the whole page and always on screen.
const OFFSCREEN_WITH_PHOTO =
  "[content-visibility:auto] [contain-intrinsic-size:auto_480px]";
const OFFSCREEN_TEXT_ONLY =
  "[content-visibility:auto] [contain-intrinsic-size:auto_180px]";

const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-line/70";

export const PostCard = ({ post, mode, isDetail = false }: PostCardProps) => {
  const locale = useLocale();
  const t = useTranslations("social.postCard");
  const tPrivacy = useTranslations("social.privacy");
  const router = useRouter();
  const confirm = useConfirm();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const hasReportOpened = useHasOpened(isReportOpen);
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
  // Trainees reply to a PT's post in the coach chat; a PT replies to a trainee's
  // post in that trainee's chat. Trainee-to-trainee chat is off (owner
  // decision 2026-11-09). The chat page itself drops the post when it cannot
  // be quoted (locked chat, post not visible).
  const canReplyInChat =
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
    router.push(
      mode === "admin"
        ? replyPostHref("admin", post.authorId, post.id)
        : replyPostHref("user", 0, post.id),
    );
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    const isConfirmed = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDescription"),
      confirmLabel: t("deleteConfirm"),
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
      className={clsx(
        CARD,
        "space-y-3 p-4",
        !isDetail && (post.photo ? OFFSCREEN_WITH_PHOTO : OFFSCREEN_TEXT_ONLY),
      )}
      aria-label={t("postOf", { name: post.authorName })}
    >
      <header className="flex items-center gap-3">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar
            name={post.authorName}
            src={post.authorAvatarUrl}
            className="size-[46px] text-base"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-semibold text-fg">
              <span className="truncate">{post.authorName}</span>
              {post.authorVerified && <VerifiedBadge />}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              {formatRelativeTime(post.createdAt, TIME_ZONE, undefined, locale)}
              {post.edited && t("edited")}
              <span aria-hidden>·</span>
              <PrivacyIcon className="size-3.5" aria-hidden />
              <span>{tPrivacy(post.privacy)}</span>
            </span>
          </span>
        </Link>
        {hasMenu && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            disabled={isPending}
            aria-busy={isPending}
            aria-label={t("optionsLabel")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-line disabled:opacity-50"
          >
            {isPending ? (
              <Spinner size="md" />
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
            aria-label={t("captionLabel")}
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
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              aria-busy={isPending}
              className={`${BUTTON_PRIMARY} min-h-11`}
            >
              {isPending && <Spinner size="md" />}
              {t("save")}
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
          aria-label={t("viewPhoto")}
          className="block w-full overflow-hidden rounded-xl bg-line"
          style={{ aspectRatio: `${post.photo.width} / ${post.photo.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.photo.url}
            alt={t("photoAlt")}
            width={post.photo.width}
            height={post.photo.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </button>
      )}

      {post.photo && (
        <LazyPhotoViewer
          photos={[
            {
              id: post.photo.id,
              src: post.photo.url,
              label: t("photoOf", { name: post.authorName }),
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
        onShare={canReplyInChat ? handleReplyInChat : undefined}
        isSharePending={isPending}
        detailHref={
          isDetail
            ? null
            : mode === "admin"
              ? adminPostPath(post.id)
              : postPath(post.id)
        }
      />

      <BottomSheet
        isOpen={isMenuOpen}
        onOpenChange={setMenuOpen}
        title={t("optionsLabel")}
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
              {t("edit")}
            </button>
          )}
          {post.canDelete && (
            <button
              type="button"
              className={`${MENU_ITEM} text-danger`}
              onClick={handleDelete}
            >
              <Trash2 className="size-5" aria-hidden />
              {t("delete")}
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
              {t("report")}
            </button>
          )}
        </div>
      </BottomSheet>
      {canReport && hasReportOpened && (
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
