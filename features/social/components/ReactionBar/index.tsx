"use client";

import clsx from "clsx";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { reactAction } from "@/features/social/services/engagement-actions";
import type { ReactionSummary } from "@/features/social/types/social";
import { applyReaction } from "@/features/social/utils/engagement-rules";
import { useHasOpened } from "@/hooks/use-has-opened";
import { describeErrorReference } from "@/utils/errors";

interface ReactionBarProps {
  postId: number;
  mode: "user" | "admin";
  reactions: ReactionSummary;
  commentCount: number;
  // Link to the post page; null when already on it.
  detailHref: string | null;
  // Share = reply in chat; omitted when the viewer cannot do that, and then
  // the action row has two columns.
  onShare?: () => void;
  isSharePending?: boolean;
}

// Every post in the feed has a bar, but the picker and the reactors list open
// only on a tap or long press, so their code loads on first open.
const ReactionPicker = dynamic(
  () =>
    import("@/features/social/components/ReactionPicker").then(
      (module) => module.ReactionPicker,
    ),
  { ssr: false },
);
const PostReactorsSheet = dynamic(
  () =>
    import("@/features/social/components/PostReactorsSheet").then(
      (module) => module.PostReactorsSheet,
    ),
  { ssr: false },
);

const LONG_PRESS_MS = 450;
const HAPTIC_MS = 10;
const HEART = "❤️";

const ACTION =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-medium text-muted active:bg-line/70";
const SUMMARY_EMOJIS = 3;

// Tap = toggle ❤️, long-press (or right click) = the six emoji. One reaction
// per person; the summary and the count open the list of who reacted.
export const ReactionBar = ({
  postId,
  mode,
  reactions,
  commentCount,
  detailHref,
  onShare,
  isSharePending = false,
}: ReactionBarProps) => {
  const t = useTranslations("social.reactionBar");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [summary, setSummary] = useOptimistic(
    reactions,
    (current, next: string | null) => applyReaction(current, next),
  );
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isReactorsOpen, setReactorsOpen] = useState(false);
  const hasPickerOpened = useHasOpened(isPickerOpen);
  const hasReactorsOpened = useHasOpened(isReactorsOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const react = (emoji: string | null) => {
    startTransition(async () => {
      setSummary(emoji);
      const result = await reactAction(mode, { postId, emoji });

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
      }
      router.refresh();
    });
  };

  const stopTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const openPicker = () => {
    navigator.vibrate?.(HAPTIC_MS);
    setPickerOpen(true);
  };

  const commentLabel = t("comments", { count: commentCount });
  const hasSummary = summary.total > 0 || commentCount > 0;

  return (
    <div>
      {hasSummary && (
        <div className="flex items-center justify-between gap-2 pb-2 text-sm text-muted">
          {summary.total > 0 ? (
            <button
              type="button"
              onClick={() => setReactorsOpen(true)}
              aria-label={t("reactionsList", { count: summary.total })}
              className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 active:bg-line/70"
            >
              <span className="flex" aria-hidden>
                {summary.counts.slice(0, SUMMARY_EMOJIS).map((item, index) => (
                  <span
                    key={item.emoji}
                    className={clsx(
                      "flex size-6 items-center justify-center rounded-full border-2 border-surface bg-line text-sm leading-none",
                      index > 0 && "-ml-2",
                    )}
                  >
                    {item.emoji}
                  </span>
                ))}
              </span>
              <span>{summary.total}</span>
            </button>
          ) : (
            <span />
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-4" aria-hidden />
              <span aria-label={commentLabel}>{commentCount}</span>
            </span>
          )}
        </div>
      )}

      <div
        className={clsx(
          "grid gap-1 border-t border-line pt-1",
          onShare ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <button
          type="button"
          aria-label={
            summary.mine ? t("reactedAs", { emoji: summary.mine }) : t("heart")
          }
          aria-pressed={summary.mine !== null}
          aria-haspopup="dialog"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            didLongPress.current = false;
            stopTimer();
            timer.current = setTimeout(() => {
              timer.current = null;
              didLongPress.current = true;
              openPicker();
            }, LONG_PRESS_MS);
          }}
          onPointerUp={stopTimer}
          onPointerLeave={stopTimer}
          onPointerCancel={stopTimer}
          onContextMenu={(event) => {
            event.preventDefault();
            stopTimer();
            didLongPress.current = true;
            setPickerOpen(true);
          }}
          onClick={() => {
            if (didLongPress.current) {
              didLongPress.current = false;
              return;
            }
            react(summary.mine ? null : HEART);
          }}
          className={clsx(ACTION, "select-none", summary.mine && "text-fg")}
        >
          {summary.mine ? (
            <span className="text-xl leading-none" aria-hidden>
              {summary.mine}
            </span>
          ) : (
            <Heart className="size-5" aria-hidden />
          )}
          <span>{summary.mine ? t("reacted") : t("like")}</span>
        </button>

        {detailHref ? (
          <Link href={detailHref} className={ACTION}>
            <MessageCircle className="size-5" aria-hidden />
            {t("comment")}
          </Link>
        ) : (
          <span className={ACTION}>
            <MessageCircle className="size-5" aria-hidden />
            {t("comment")}
          </span>
        )}

        {onShare && (
          <button
            type="button"
            onClick={onShare}
            disabled={isSharePending}
            aria-busy={isSharePending}
            aria-label={t("shareAria")}
            className={clsx(ACTION, "disabled:opacity-50")}
          >
            {isSharePending ? (
              <Spinner size="md" />
            ) : (
              <Share2 className="size-5" aria-hidden />
            )}
            {t("share")}
          </button>
        )}
      </div>

      {hasPickerOpened && (
        <ReactionPicker
          isOpen={isPickerOpen}
          onOpenChange={setPickerOpen}
          mine={summary.mine}
          onPick={react}
        />
      )}
      {hasReactorsOpened && (
        <PostReactorsSheet
          isOpen={isReactorsOpen}
          onOpenChange={setReactorsOpen}
          postId={postId}
          mode={mode}
        />
      )}
    </div>
  );
};
