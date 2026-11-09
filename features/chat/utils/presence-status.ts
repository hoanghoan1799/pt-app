import { TIME_ZONE } from "@/constants/time";
import {
  formatLastSeen,
  isOnline,
  latestSeen,
  parseLastSeen,
} from "@/features/chat/utils/presence";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export interface PresenceView {
  online: boolean;
  // Null = never seen: the UI shows nothing.
  text: string | null;
}

export const presenceView = (
  lastSeenAt: Date | null,
  now: Date,
  locale: Locale = DEFAULT_LOCALE,
): PresenceView => ({
  online: isOnline(lastSeenAt, now),
  text: formatLastSeen(lastSeenAt, now, TIME_ZONE, locale),
});

// Inbox rows have little room: "5 phút trước" instead of "Hoạt động 5 phút
// trước". Null when online (the dot says it) or never seen.
export const shortLastSeen = (
  lastSeenAt: Date | null,
  now: Date,
  locale: Locale = DEFAULT_LOCALE,
): string | null => {
  if (isOnline(lastSeenAt, now)) {
    return null;
  }
  const text = formatLastSeen(lastSeenAt, now, TIME_ZONE, locale);
  const prefix = getFormatTranslator(locale)("presence.prefix");

  return text?.startsWith(prefix) ? text.slice(prefix.length) : text;
};

// Where the thread asks for the other side's last seen when the message poll
// answered 204 (which carries no presence).
export const peerPresenceUrl = (
  role: "user" | "admin",
  userId: number,
): string =>
  role === "admin"
    ? `/api/presence/peer?as=admin&userId=${userId}`
    : "/api/presence/peer";

export const heartbeatUrl = (role: "user" | "admin"): string =>
  role === "admin" ? "/api/presence?as=admin" : "/api/presence";

// Merges what we know with a newer reading; presence never moves backwards
// (a slow response must not overwrite a fresher one).
export const mergeLastSeen = (
  current: Date | null,
  incoming: string | null | undefined,
): Date | null => latestSeen([current, parseLastSeen(incoming)]);

// Timers and fetches only run while the page is visible.
export const shouldRunPresence = (visibility: DocumentVisibilityState) =>
  visibility === "visible";

// Last-seen is stamped by the server clock, but "now" came from the viewer's
// device. A device clock that runs behind made an old heartbeat look recent
// (or even in the future, which reads as online), so an idle trainee showed
// "Đang hoạt động". The skew (server minus device, in ms) is measured from a
// server timestamp and added to the device clock.
export const clockSkewMs = (
  serverNow: string | null | undefined,
  deviceNowMs: number,
): number => {
  const server = parseLastSeen(serverNow);

  return server === null ? 0 : server.getTime() - deviceNowMs;
};

// The current time on the server's clock.
export const serverClockNow = (deviceNowMs: number, skewMs: number): Date =>
  new Date(deviceNowMs + skewMs);
