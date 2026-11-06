import {
  type ChatColorKey,
  DEFAULT_CHAT_COLOR,
  isChatColorKey,
} from "@/features/chat/utils/chat-palette";
import {
  CHAT_NICKNAME_MAX_LENGTH,
  parseAdminTarget,
} from "@/features/chat/utils/chat-rules";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";
import { displayNameFor } from "@/features/chat/utils/display-name";

// Pure rules behind the conversation settings sheet and the coloured bubbles
// (KAN-142, spec D1, D2, D4). Keys are "user", "pt" and "admin:<id>".

// Nicknames and resolved bubble colours as the thread payload carries them.
export interface ChatProfileView {
  nicknames: Record<string, string>;
  colors: Record<string, string>;
}

export const EMPTY_PROFILE_VIEW: ChatProfileView = {
  nicknames: {},
  colors: {},
};

export const adminKey = (adminId: number) => `admin:${adminId}`;

export interface NicknameTarget {
  key: string;
  // The real name shown when there is no nickname.
  realName: string;
}

// The two nicknames the sheet edits: the other person and the viewer.
// Trainee: the PT side as a whole ("pt") and themselves ("user"). Admin: the
// trainee ("user") and themselves ("admin:<id>").
export const settingsTargets = (
  viewer: ThreadViewer,
  names: { peerName: string; selfName: string },
): { other: NicknameTarget; self: NicknameTarget } =>
  viewer.role === "admin"
    ? {
        other: { key: "user", realName: names.peerName },
        self: { key: adminKey(viewer.adminId), realName: names.selfName },
      }
    : {
        other: { key: "pt", realName: names.peerName },
        self: { key: "user", realName: names.selfName },
      };

export const nicknameLength = (value: string) => Array.from(value).length;

export const isNicknameTooLong = (value: string) =>
  nicknameLength(value.trim()) > CHAT_NICKNAME_MAX_LENGTH;

// Save is offered only for a real change (a no-op save is pointless) that
// fits the limit.
export const canSaveNickname = (draft: string, saved: string | undefined) =>
  draft.trim() !== (saved ?? "") && !isNicknameTooLong(draft);

// The key a message's bubble colour is looked up under.
export const senderColorKey = (message: {
  senderRole: "user" | "admin";
  senderAdminId: number | null;
}) =>
  message.senderRole === "user"
    ? "user"
    : message.senderAdminId === null
      ? null
      : adminKey(message.senderAdminId);

// Bubble colour of one message for this viewer. Own-side bubbles (the
// trainee's own, or for an admin every PT bubble) always have a colour, the
// default orange when none was picked. The other side keeps the neutral
// surface style (null) unless the sender picked one (D4).
export const bubbleColorFor = (
  message: { senderRole: "user" | "admin"; senderAdminId: number | null },
  mine: boolean,
  colors: Readonly<Record<string, string>>,
): ChatColorKey | null => {
  const key = senderColorKey(message);
  const picked = key === null ? undefined : colors[key];

  if (isChatColorKey(picked)) {
    return picked;
  }
  return mine ? DEFAULT_CHAT_COLOR : null;
};

// Name of a PT sender label: their own nickname, else the shared PT one (for
// the trainee), else the real name (D2).
export const adminLabel = (
  nicknames: Readonly<Record<string, string>>,
  adminId: number | null,
  realName: string,
  fallbackKey?: string,
) => {
  const own =
    adminId === null ? undefined : nicknames[adminKey(adminId)]?.trim();

  if (own) {
    return own;
  }
  return fallbackKey
    ? displayNameFor(nicknames, fallbackKey, realName)
    : realName;
};

// Name of a reactor in the reactors sheet: their nickname (an admin's own,
// else for the trainee the shared PT one), else the real name (D2).
export const reactorLabel = (
  nicknames: Readonly<Record<string, string>>,
  reactorKey: string,
  realName: string,
  viewerRole: "user" | "admin",
) => {
  const adminId = parseAdminTarget(reactorKey);

  if (adminId === null) {
    return displayNameFor(nicknames, reactorKey, realName);
  }
  return adminLabel(
    nicknames,
    adminId,
    realName,
    viewerRole === "user" ? "pt" : undefined,
  );
};
