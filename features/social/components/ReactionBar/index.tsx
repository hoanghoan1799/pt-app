"use client";

import clsx from "clsx";
import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { PostReactorsSheet } from "@/features/social/components/PostReactorsSheet";
import { ReactionPicker } from "@/features/social/components/ReactionPicker";
import { reactAction } from "@/features/social/services/engagement-actions";
import type { ReactionSummary } from "@/features/social/types/social";
import { applyReaction } from "@/features/social/utils/engagement-rules";
import { describeErrorReference } from "@/utils/errors";

interface ReactionBarProps {
  postId: number;
  mode: "user" | "admin";
  reactions: ReactionSummary;
  commentCount: number;
  // Link to the post page; null when already on it.
  detailHref: string | null;
}

const LONG_PRESS_MS = 450;
const HAPTIC_MS = 10;
const HEART = "❤️";

const ACTION =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-muted active:bg-line/70";

// Tap = toggle ❤️, long-press (or right click) = the six emoji. One reaction
// per person; the summary and the count open the list of who reacted.
export const ReactionBar = ({
  postId,
  mode,
  reactions,
  commentCount,
  detailHref,
}: ReactionBarProps) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [summary, setSummary] = useOptimistic(
    reactions,
    (current, next: string | null) => applyReaction(current, next),
  );
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isReactorsOpen, setReactorsOpen] = useState(false);
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

  const commentLabel = `${commentCount} bình luận`;

  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2">
      <button
        type="button"
        aria-label={summary.mine ? `Bạn đã thả ${summary.mine}` : "Thả tim"}
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
        <span>{summary.mine ? "Đã thả" : "Thích"}</span>
      </button>

      {summary.total > 0 && (
        <button
          type="button"
          onClick={() => setReactorsOpen(true)}
          aria-label={`${summary.total} lượt cảm xúc, xem danh sách`}
          className={ACTION}
        >
          <span className="flex" aria-hidden>
            {summary.counts.map((item) => (
              <span key={item.emoji} className="text-base leading-none">
                {item.emoji}
              </span>
            ))}
          </span>
          <span>{summary.total}</span>
        </button>
      )}

      {detailHref ? (
        <Link href={detailHref} className={clsx(ACTION, "ml-auto")}>
          <MessageCircle className="size-5" aria-hidden />
          {commentLabel}
        </Link>
      ) : (
        <span className={clsx(ACTION, "ml-auto")}>
          <MessageCircle className="size-5" aria-hidden />
          {commentLabel}
        </span>
      )}

      <ReactionPicker
        isOpen={isPickerOpen}
        onOpenChange={setPickerOpen}
        mine={summary.mine}
        onPick={react}
      />
      <PostReactorsSheet
        isOpen={isReactorsOpen}
        onOpenChange={setReactorsOpen}
        postId={postId}
        mode={mode}
      />
    </div>
  );
};
