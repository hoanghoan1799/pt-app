"use client";

import { Send } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  TEXTAREA,
} from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { COMMENT_MAX_LENGTH } from "@/features/social/constants/social";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
} from "@/features/social/services/engagement-actions";
import type { CommentView } from "@/features/social/types/social";
import { describeErrorReference } from "@/utils/errors";
import { formatRelativeTime } from "@/utils/time";

interface CommentSectionProps {
  postId: number;
  mode: "user" | "admin";
  comments: CommentView[];
}

// Mounted only once a comment is being reported, so its code loads on demand.
const ReportSheet = dynamic(
  () =>
    import("@/features/social/components/ReportSheet").then(
      (module) => module.ReportSheet,
    ),
  { ssr: false },
);

const LINK_BUTTON =
  "min-h-8 text-xs font-semibold text-muted active:text-fg disabled:opacity-50";

// Flat comment list plus the composer (spec R5).
export const CommentSection = ({
  postId,
  mode,
  comments,
}: CommentSectionProps) => {
  const locale = useLocale();
  const t = useTranslations("social.comments");
  const router = useRouter();
  const confirm = useConfirm();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // Runs an action; true when it succeeded.
  const run = async (
    action: () => Promise<{
      status: string;
      message?: string;
      reference?: string;
    }>,
  ) => {
    const result = await action();

    if (result.status === "error") {
      toast.error(result.message, {
        description: describeErrorReference(result.reference),
      });
      return false;
    }
    router.refresh();
    return true;
  };

  const handleSend = () => {
    startTransition(async () => {
      if (await run(() => addCommentAction(mode, { postId, body }))) {
        setBody("");
      }
    });
  };

  const handleSaveEdit = (commentId: number) => {
    startTransition(async () => {
      if (
        await run(() => editCommentAction(mode, { commentId, body: editBody }))
      ) {
        setEditingId(null);
      }
    });
  };

  const handleDelete = async (commentId: number) => {
    const isConfirmed = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDescription"),
      confirmLabel: t("deleteConfirm"),
      isDanger: true,
    });

    if (isConfirmed) {
      startTransition(async () => {
        await run(() => deleteCommentAction(mode, commentId));
      });
    }
  };

  return (
    <section className="space-y-3" aria-label={t("label")}>
      {reportingId !== null && (
        <ReportSheet
          key={reportingId}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setReportingId(null);
            }
          }}
          mode={mode}
          targetKind="comment"
          targetId={reportingId}
        />
      )}
      {comments.length === 0 ? (
        <p className={`${CARD} p-4 text-center text-muted`}>{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className={`${CARD} flex gap-3 p-3`}>
              <Avatar
                name={comment.authorName}
                src={comment.authorAvatarUrl}
                className="size-9 shrink-0 text-xs"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex items-center gap-1 text-sm font-semibold text-fg">
                  {comment.authorHref ? (
                    <Link href={comment.authorHref} className="truncate">
                      {comment.authorName}
                    </Link>
                  ) : (
                    <span className="truncate">{comment.authorName}</span>
                  )}
                  {comment.authorVerified && <VerifiedBadge />}
                  <span className="shrink-0 text-xs font-normal text-muted">
                    {formatRelativeTime(
                      comment.createdAt,
                      TIME_ZONE,
                      undefined,
                      locale,
                    )}
                    {comment.edited && t("edited")}
                  </span>
                </p>
                {editingId === comment.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editBody}
                      maxLength={COMMENT_MAX_LENGTH}
                      onChange={(event) => setEditBody(event.target.value)}
                      aria-label={t("editLabel")}
                      className={TEXTAREA}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={isPending}
                        className={`${BUTTON_SECONDARY} min-h-11`}
                      >
                        {t("cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={isPending || editBody.trim() === ""}
                        aria-busy={isPending}
                        className={`${BUTTON_PRIMARY} min-h-11`}
                      >
                        {isPending && <Spinner size="md" />}
                        {t("save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-base break-words whitespace-pre-wrap text-fg">
                      {comment.body}
                    </p>
                    <div className="flex gap-4">
                      {!comment.canEdit && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setReportingId(comment.id)}
                          className={LINK_BUTTON}
                        >
                          {t("report")}
                        </button>
                      )}
                      {comment.canEdit && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditBody(comment.body);
                          }}
                          className={LINK_BUTTON}
                        >
                          {t("edit")}
                        </button>
                      )}
                      {comment.canDelete && (
                        <button
                          type="button"
                          disabled={isPending}
                          aria-busy={isPending}
                          onClick={() => handleDelete(comment.id)}
                          className={`${LINK_BUTTON} inline-flex items-center gap-1 text-danger`}
                        >
                          {isPending && <Spinner size="sm" />}
                          {t("delete")}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={`${CARD} space-y-2 p-3`}>
        <textarea
          value={body}
          maxLength={COMMENT_MAX_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className={TEXTAREA}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {body.length}/{COMMENT_MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || body.trim() === ""}
            aria-busy={isPending}
            className={`${BUTTON_PRIMARY} min-h-11`}
          >
            {isPending ? (
              <Spinner size="md" />
            ) : (
              <Send className="size-5" aria-hidden />
            )}
            {t("send")}
          </button>
        </div>
      </div>
    </section>
  );
};
