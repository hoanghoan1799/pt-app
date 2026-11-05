import clsx from "clsx";

import type { PresenceView } from "@/features/chat/utils/presence-status";

interface PresenceStatusProps {
  presence: PresenceView | null;
  className?: string;
}

// The other side's status line: green dot and "Đang hoạt động" while online,
// otherwise the muted last-seen text. Nothing when never seen. Not a live
// region: the label changes on a timer and must not be announced each time.
export const PresenceStatus = ({
  presence,
  className,
}: PresenceStatusProps) => {
  if (!presence?.text) {
    return null;
  }

  return (
    <p
      role="status"
      aria-live="off"
      aria-label={`Trạng thái hoạt động: ${presence.text}`}
      data-online={presence.online}
      className={clsx(
        "flex items-center gap-1.5 text-xs",
        presence.online ? "font-medium text-fg" : "text-muted",
        className,
      )}
    >
      {presence.online && (
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
      )}
      <span className="truncate">{presence.text}</span>
    </p>
  );
};
