import clsx from "clsx";

import {
  initialsOf,
  type ThreadItem,
} from "@/features/chat/utils/chat-thread-rules";

type MessageItem = Extract<ThreadItem, { kind: "message" }>;

interface MessageBubbleProps {
  item: MessageItem;
  onRetry: (clientId: string) => void;
}

// One chat bubble: mine right in the accent colour, the PT left. Spacing is
// tighter inside a run; the PT's avatar sits on the last bubble of a run.
export const MessageBubble = ({ item, onRetry }: MessageBubbleProps) => {
  const {
    message,
    mine,
    isFirstInRun,
    isLastInRun,
    senderName,
    showAvatar,
    statusLine,
  } = item;
  const isFailed = message.delivery === "failed";
  const isSending = message.delivery === "sending";

  return (
    <div
      className={clsx(
        "flex flex-col",
        mine ? "items-end" : "items-start",
        isFirstInRun ? "mt-3" : "mt-0.5",
      )}
    >
      {senderName && (
        <p className="mb-1 ml-9 max-w-[75%] truncate text-xs font-medium text-muted">
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
          <span
            aria-hidden
            className={clsx(
              "flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent",
              !showAvatar && "invisible",
            )}
          >
            {initialsOf(message.senderAdminName)}
          </span>
        )}
        <p
          className={clsx(
            "max-w-[75%] rounded-[1.25rem] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap",
            mine
              ? "bg-accent text-accent-fg"
              : "border border-line bg-surface text-fg",
            mine && isSending && "opacity-70",
            mine && isFailed && "bg-danger text-white",
          )}
        >
          {message.body}
        </p>
      </div>
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
