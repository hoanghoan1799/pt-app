import { ADMIN_MESSAGES_SEGMENT, ROUTES } from "@/constants/routes";

// Where the chat, its info page and the info sub-pages live for each side
// (KAN-160). The trainee has one fixed set; an admin has one per trainee.
export interface ChatPaths {
  chat: string;
  info: string;
  photos: string;
  search: string;
}

const pathsUnder = (base: string): ChatPaths => ({
  chat: base,
  info: `${base}/info`,
  photos: `${base}/photos`,
  search: `${base}/search`,
});

export const chatPaths = (role: "user" | "admin", userId: number): ChatPaths =>
  role === "admin"
    ? pathsUnder(`${ROUTES.ADMIN_USERS}/${userId}/${ADMIN_MESSAGES_SEGMENT}`)
    : pathsUnder(ROUTES.MESSAGES_COACH);

// The chat opened at one message: it is loaded, scrolled to and highlighted.
export const jumpHref = (chatPath: string, messageId: number) =>
  `${chatPath}?m=${messageId}`;

// `?m=` of the chat page; anything that is not a plain positive id is ignored.
export const parseJumpId = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
};
