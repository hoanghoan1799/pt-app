import { TIME_ZONE } from "@/constants/time";
import { PEER_DELETED_NAME } from "@/features/chat/utils/chat-thread-rules";
import { formatShortDate } from "@/utils/time";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const YOU_PREFIX = "Bạn: ";

interface PreviewSender {
  lastFromAdmin: boolean;
  lastSenderAdminId: number | null;
  lastSenderAdminName: string | null;
}

// Who wrote the last message, as a prefix for the one-line preview: nothing
// for the trainee, "Bạn: " for the viewing admin, a colleague's username, or
// "PT (đã xoá): " when that account is gone.
export const inboxPreviewPrefix = (
  item: PreviewSender,
  viewerAdminId: number,
) => {
  if (!item.lastFromAdmin) {
    return "";
  }
  if (item.lastSenderAdminId === viewerAdminId) {
    return YOU_PREFIX;
  }
  return `${item.lastSenderAdminName ?? PEER_DELETED_NAME}: `;
};

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayKey = (value: number) => dayFormatter.format(new Date(value));

// Inbox row time: "Vừa xong", "N phút", "N giờ" (same calendar day in the app
// time zone), "Hôm qua", then dd/MM. Empty when there is no message.
export const formatInboxTime = (
  timestamp: number | null,
  nowMs: number,
): string => {
  if (timestamp === null) {
    return "";
  }
  const elapsed = nowMs - timestamp;

  if (elapsed < MINUTE_MS) {
    return "Vừa xong";
  }
  const today = dayKey(nowMs);
  const day = dayKey(timestamp);

  if (day === today) {
    return elapsed < HOUR_MS
      ? `${Math.floor(elapsed / MINUTE_MS)} phút`
      : `${Math.floor(elapsed / HOUR_MS)} giờ`;
  }
  if (day === dayKey(nowMs - DAY_MS)) {
    return "Hôm qua";
  }
  return formatShortDate(timestamp, TIME_ZONE);
};
