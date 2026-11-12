import type { AuthActor } from "../auth/actor.js";
import { previewTexts } from "../chat/preview-text.js";

// Pure rules of the trainee-to-trainee chat (P5). No database in here.

// Who may open a conversation (Q6): its two members, unless one blocked the
// other (then it is hidden); a super admin read-only; a PT never.
export type DmAccess = "member" | "readonly_admin" | "none";

export const dmAccessOf = (
  viewer: AuthActor,
  members: { low: number; high: number },
  isBlocked: boolean,
): DmAccess => {
  if (viewer.kind === "admin") {
    return viewer.role === "super_admin" ? "readonly_admin" : "none";
  }
  const isMember = viewer.id === members.low || viewer.id === members.high;

  return isMember && !isBlocked ? "member" : "none";
};

export const otherMember = (
  members: { low: number; high: number },
  userId: number,
) => (members.low === userId ? members.high : members.low);

// Inbox preview line of the last message.
export const dmPreviewText = (
  message: {
    body: string | null;
    photoId: number | null;
    deletedAt: Date | null;
  },
  locale?: string | null,
) => {
  const texts = previewTexts(locale);

  if (message.deletedAt !== null) {
    return texts.unsent;
  }
  if (message.photoId !== null) {
    return message.body
      ? `📷 ${texts.photo} ${message.body}`
      : `📷 ${texts.photo}`;
  }
  return message.body ?? "";
};

// Sorted pair, so one conversation per two trainees.
export const dmPairOf = (a: number, b: number) =>
  a < b ? { low: a, high: b } : { low: b, high: a };
