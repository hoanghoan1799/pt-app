import { chatNicknameOr } from "@pt/contracts";

import {
  type ChatColorKey,
  DEFAULT_CHAT_COLOR,
  isChatColorKey,
} from "@/features/chat/utils/chat-palette";
import { parseAdminTarget } from "@/features/chat/utils/chat-rules";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";

// Pure rules behind the conversation settings sheet and the coloured bubbles
// (KAN-142, spec D1, D2, D4). Keys are "user", "pt" and "admin:<id>".

// The conversation's shared nicknames and the resolved bubble colours as the
// thread payload carries them.
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

// The two nicknames the settings sheet edits: the other person and the viewer
// (anyone in the conversation may name anyone in it, themselves included).
// Trainee: the PT side as a whole ("pt") and themselves ("user"). Admin: the
// trainee ("user") and themselves ("admin:<id>"). `self` is also whose bubble
// colour the sheet picks.
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

// Name of a PT sender label: the conversation's nickname for that admin, else
// for the trainee the shared PT one, else the real name.
export const adminLabel = (
  nicknames: Readonly<Record<string, string>>,
  adminId: number | null,
  realName: string,
  fallbackKey?: string,
) => {
  const fallback = fallbackKey
    ? chatNicknameOr(nicknames, fallbackKey, realName)
    : realName;

  return adminId === null
    ? fallback
    : chatNicknameOr(nicknames, adminKey(adminId), fallback);
};

// Name of a reactor in the reactors sheet: their shared nickname (for an
// admin, else for the trainee the shared PT one), else the real name.
export const reactorLabel = (
  nicknames: Readonly<Record<string, string>>,
  reactorKey: string,
  realName: string,
  viewerRole: "user" | "admin",
) => {
  const adminId = parseAdminTarget(reactorKey);

  if (adminId === null) {
    return chatNicknameOr(nicknames, reactorKey, realName);
  }
  return adminLabel(
    nicknames,
    adminId,
    realName,
    viewerRole === "user" ? "pt" : undefined,
  );
};
