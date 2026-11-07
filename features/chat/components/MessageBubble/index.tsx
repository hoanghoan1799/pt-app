"use client";

import clsx from "clsx";
import Image from "next/image";
import { useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { AvatarLightbox } from "@/components/common/AvatarLightbox";
import { useBubbleGesture } from "@/features/chat/hooks/use-bubble-gesture";
import {
  CHAT_TEXT_ON_COLOR,
  chatColorHex,
  type ChatColorKey,
} from "@/features/chat/utils/chat-palette";
import {
  groupReactions,
  quoteLabel,
  quoteText,
  type ThreadItem,
  type ThreadMessage,
  type ThreadViewer,
  UNSENT_TEXT,
} from "@/features/chat/utils/chat-thread-rules";

const STICKER_SIZE_PX = 120;

type MessageItem = Extract<ThreadItem, { kind: "message" }>;

interface MessageBubbleProps {
  item: MessageItem;
  viewer: ThreadViewer;
  onRetry: (clientId: string) => void;
  // True briefly after a tap on a quote scrolled here.
  isHighlighted?: boolean;
  onOpenActions: (message: ThreadMessage) => void;
  onToggleHeart: (message: ThreadMessage) => void;
  onOpenReactors: (message: ThreadMessage, emoji: string) => void;
  onOpenHistory: (message: ThreadMessage) => void;
  onJumpToReply: (messageId: number) => void;
  nicknames?: Readonly<Record<string, string>>;
  // The sender's photo (versioned URL) beside their bubbles; initials if null.
  avatarSrc?: string | null;
  // The sender's palette colour (white text, AA on every entry); null keeps
  // the neutral surface style (KAN-142).
  color?: ChatColorKey | null;
}

// One chat bubble: mine right in the accent colour, the other side left. Spacing is
// tighter inside a run; the other side's avatar sits on the last bubble of a run.
// Double-tap hearts it, a single tap on a sticker opens it full screen (after
// the double-tap window, so a heart never opens the viewer), long-press (or Enter / the context-menu key) opens the
// actions sheet; text selection is off so the long press is ours.
export const MessageBubble = ({
  item,
  viewer,
  onRetry,
  isHighlighted = false,
  onOpenActions,
  onToggleHeart,
  onOpenReactors,
  onOpenHistory,
  onJumpToReply,
  color = null,
  nicknames,
  avatarSrc = null,
}: MessageBubbleProps) => {
  const {
    message,
    mine,
    isFirstInRun,
    isLastInRun,
    senderName,
    showAvatar,
    avatarName,
    statusLine,
  } = item;
  const isFailed = message.delivery === "failed";
  const isSending = message.delivery === "sending";
  const isUnsent = message.deleted;
  const { sticker } = message;
  // A sticker is just the picture: no bubble, no background (KAN-145).
  const isSticker = Boolean(sticker) && !isUnsent;
  // Only stored, not unsent messages have actions.
  const isInteractive = message.id !== null && !isUnsent;
  const [isViewerOpen, setViewerOpen] = useState(false);
  const gesture = useBubbleGesture(isInteractive, {
    onDoubleTap: () => onToggleHeart(message),
    onLongPress: () => onOpenActions(message),
    onSingleTap: sticker && isSticker ? () => setViewerOpen(true) : undefined,
  });
  const groups = isUnsent ? [] : groupReactions(message.reactions, viewer);
  const { replyTo } = message;
  const sideMargin = mine ? "mr-1" : "ml-9";
  const isColored =
    color !== null && !isUnsent && !isSticker && !(mine && isFailed);

  return (
    <div
      data-message-id={message.id ?? undefined}
      className={clsx(
        "flex flex-col",
        mine ? "items-end" : "items-start",
        isFirstInRun ? "mt-3" : "mt-0.5",
      )}
    >
      {senderName && (
        <p
          className={clsx(
            "mb-1 max-w-[75%] truncate text-xs font-medium text-muted",
            // Left runs clear the avatar; right runs line up with the bubble.
            sideMargin,
          )}
        >
          {senderName}
        </p>
      )}
      <div
        className={clsx(
          "flex w-full items-end gap-1.5",
          mine ? "justify-end" : "justify-start",
        )}
      >
        {!mine && (
          <span className={clsx(!showAvatar && "invisible")}>
            <Avatar
              name={avatarName}
              src={avatarSrc}
              tone="soft"
              className="size-7 text-[11px]"
            />
          </span>
        )}
        <div
          {...gesture}
          tabIndex={isInteractive ? 0 : undefined}
          data-bubble
          data-sticker={isSticker ? "" : undefined}
          data-bubble-color={isColored ? color : undefined}
          style={
            isColored
              ? {
                  backgroundColor: chatColorHex(color),
                  color: CHAT_TEXT_ON_COLOR,
                }
              : undefined
          }
          className={clsx(
            "flex max-w-[75%] touch-manipulation flex-col rounded-[1.25rem] text-[15px] leading-snug select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none",
            isUnsent
              ? "border border-line px-3.5 py-2 text-muted italic"
              : isSticker
                ? mine
                  ? "items-end"
                  : "items-start"
                : isColored
                  ? "px-3.5 py-2"
                  : mine
                    ? "bg-accent px-3.5 py-2 text-accent-fg"
                    : "border border-line bg-surface px-3.5 py-2 text-fg",
            mine && !isUnsent && isSending && "opacity-70",
            mine && !isUnsent && isFailed && "bg-danger text-white",
            isHighlighted && "ring-2 ring-accent",
          )}
        >
          {replyTo && !isUnsent && (
            <button
              type="button"
              onClick={() => onJumpToReply(replyTo.id)}
              aria-label="Xem tin nhắn được trả lời"
              className={clsx(
                "mb-1.5 block max-w-full border-l-2 py-0.5 pl-2 text-left text-xs",
                isColored
                  ? "border-white/60 text-white/85"
                  : isSticker
                    ? "border-accent text-muted"
                    : mine
                      ? "border-accent-fg/60 text-accent-fg/80"
                      : "border-accent text-muted",
              )}
            >
              <span className="block truncate font-semibold">
                {quoteLabel(replyTo, viewer, nicknames)}
              </span>
              <span
                className={clsx(
                  "line-clamp-2 break-words",
                  replyTo.deleted && "italic",
                )}
              >
                {quoteText(replyTo)}
              </span>
            </button>
          )}
          {sticker && !isUnsent ? (
            <Image
              src={sticker.url}
              alt={sticker.alt}
              width={STICKER_SIZE_PX}
              height={STICKER_SIZE_PX}
              loading="lazy"
              unoptimized
              draggable={false}
              className={clsx(
                "pointer-events-none size-[120px] object-contain",
                sticker.kind === "pack" && "sticker-pop",
                mine && isSending && "opacity-70",
              )}
            />
          ) : (
            <p className="break-words whitespace-pre-wrap">
              {isUnsent ? UNSENT_TEXT : message.body}
            </p>
          )}
        </div>
      </div>
      {sticker && isSticker && (
        // Outside the gesture element: the portal's events bubble through
        // React, and a tap in the viewer must not start a bubble gesture.
        <AvatarLightbox
          isOpen={isViewerOpen}
          onClose={() => setViewerOpen(false)}
          src={sticker.url}
          name={sticker.alt}
        />
      )}
      {groups.length > 0 && (
        <div
          className={clsx(
            "-mt-1 flex max-w-[75%] flex-wrap gap-1",
            mine ? "mr-2 justify-end" : "ml-11",
          )}
        >
          {groups.map((group) => (
            <button
              key={group.emoji}
              type="button"
              onClick={() => onOpenReactors(message, group.emoji)}
              aria-label={`${group.emoji} ${group.count}`}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                group.mine ? "bg-accent/15 text-fg" : "bg-fg/5 text-muted",
              )}
            >
              <span aria-hidden>{group.emoji}</span>
              {group.count > 1 && <span aria-hidden>{group.count}</span>}
            </button>
          ))}
        </div>
      )}
      {message.editedAt && !isUnsent && (
        <button
          type="button"
          onClick={() => onOpenHistory(message)}
          className={clsx(
            "mt-0.5 rounded px-0.5 text-[11px] text-muted underline-offset-2 active:underline",
            sideMargin,
          )}
        >
          Đã chỉnh sửa
        </button>
      )}
      {mine && isSending && (
        <p className="mt-1 mr-1 text-xs text-muted">Đang gửi…</p>
      )}
      {mine && isFailed && (
        <p className="mt-1 mr-1 flex items-center gap-2 text-xs text-danger">
          Chưa gửi được
          <button
            type="button"
            onClick={() => onRetry(message.clientId)}
            className="rounded-full border border-danger/40 px-2.5 py-1 font-semibold active:bg-danger/10"
          >
            Gửi lại
          </button>
        </p>
      )}
      {statusLine && isLastInRun && (
        <p className="mt-1 mr-1 text-xs text-muted">{statusLine}</p>
      )}
    </div>
  );
};
