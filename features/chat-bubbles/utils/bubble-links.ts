import { ROUTES } from "@/constants/routes";
import { chatPaths } from "@/features/chat/utils/chat-links";
import type { BubbleRole } from "@/features/chat-bubbles/types";

export const COACH_KEY = "coach";
const USER_KEY = /^user:([1-9]\d{0,14})$/;

// Trainee: the one coach chat. Admin: one chat per trainee.
export const bubbleKeyFor = (role: BubbleRole, userId: number) =>
  role === "user" ? COACH_KEY : `user:${userId}`;

// The trainee id behind an admin key; null for anything else.
export const adminKeyUserId = (key: string) => {
  const match = USER_KEY.exec(key);

  return match ? Number(match[1]) : null;
};

// Only keys this role can open: "coach" for a trainee, "user:<id>" for an admin.
export const isKeyForRole = (role: BubbleRole, key: unknown): key is string =>
  typeof key === "string" &&
  (role === "user" ? key === COACH_KEY : USER_KEY.test(key));

export const chatPathForKey = (role: BubbleRole, key: string) => {
  if (role === "user") {
    return ROUTES.MESSAGES_COACH;
  }
  const userId = adminKeyUserId(key);

  return userId === null ? null : chatPaths("admin", userId).chat;
};

export const withEmbed = (path: string) => `${path}?embed=1`;

// Where the panel iframe loads and where "open full screen" goes.
export const bubbleHrefs = (role: BubbleRole, key: string) => {
  const path = chatPathForKey(role, key);

  return path === null ? null : { href: path, embedHref: withEmbed(path) };
};

// `?embed=1` of the chat pages.
export const isEmbedParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) === "1";

// A link click inside the panel that leaves the chat is handed to the parent.
// Same-origin only; a link to the chat itself (e.g. `?m=5`) stays inside.
export const isLeavingChat = (
  href: string,
  currentPathname: string,
  origin: string,
) => {
  try {
    const url = new URL(href, origin);

    return url.origin === origin && url.pathname !== currentPathname;
  } catch {
    return false;
  }
};

// The parent only follows plain in-app paths.
export const safeNavigateHref = (value: unknown) =>
  typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : null;
