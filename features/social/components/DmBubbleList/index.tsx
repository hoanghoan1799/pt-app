"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { ChatPhotoImage } from "@/features/chat/components/ChatPhotoImage";
import { PHOTO_ALT } from "@/features/chat/utils/photo-rules";
import { DmPostQuote } from "@/features/social/components/DmPostQuote";
import type { DmThreadItem } from "@/features/social/utils/dm-thread-rules";

interface DmBubbleListProps {
  items: DmThreadItem[];
  // The signed-in trainee; null for the read-only admin view.
  meId: number | null;
  // Admin view: sender names by id.
  names?: Map<number, string>;
  // The own message the other member has read last.
  seenId?: number | null;
  onUnsend?: (messageId: number) => void;
  onRetry?: (clientId: string) => void;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

// Plain bubbles in the chat colours: mine on the right in the accent colour,
// theirs on the left. An own message has a "Thu hồi" button (confirm-free: the
// message is only taken back, nothing else is lost).
export const DmBubbleList = ({
  items,
  meId,
  names,
  seenId = null,
  onUnsend,
  onRetry,
}: DmBubbleListProps) => {
  const t = useTranslations("social.dmBubbleList");

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const isMine = meId !== null && item.senderId === meId;

        return (
          <li
            key={item.clientId}
            className={clsx(
              "flex flex-col gap-0.5",
              isMine ? "items-end" : "items-start",
            )}
          >
            {names && (
              <span className="px-1 text-xs font-medium text-muted">
                {names.get(item.senderId) ?? t("deleted")}
              </span>
            )}
            <div
              className={clsx(
                "max-w-[80%] space-y-1.5 rounded-2xl px-3 py-2 text-base break-words",
                isMine
                  ? "bg-accent text-accent-fg"
                  : "border border-line bg-surface text-fg",
                item.pending === "sending" && "opacity-70",
              )}
            >
              {item.post && <DmPostQuote post={item.post} />}
              {item.photo && (
                <ChatPhotoImage
                  photo={{ ...item.photo, alt: PHOTO_ALT }}
                  isDimmed={item.pending === "sending"}
                />
              )}
              {item.body && (
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {item.body}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 px-1 text-xs text-muted">
              <time dateTime={item.createdAt}>
                {formatTime(item.createdAt)}
              </time>
              {item.pending === "failed" && onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(item.clientId)}
                  className="inline-flex min-h-8 items-center gap-1 font-semibold text-danger"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t("retry")}
                </button>
              )}
              {isMine && !item.pending && seenId === item.id && (
                <span>{t("seen")}</span>
              )}
              {isMine && !item.pending && onUnsend && (
                <button
                  type="button"
                  onClick={() => onUnsend(item.id)}
                  className="inline-flex min-h-8 items-center font-semibold"
                >
                  {t("unsend")}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
