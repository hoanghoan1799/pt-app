import "server-only";

import { getTranslations } from "next-intl/server";

import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import { loadChatProfile } from "@/features/chat/services/chat-profile";
import {
  findConversationByUserId,
  findLatestAdminSender,
} from "@/features/chat/services/chat-queries";
import { getAdminTeamLastSeen } from "@/features/chat/services/presence";
import { adminLabel } from "@/features/chat/utils/chat-settings";
import { displayNameFor } from "@/features/chat/utils/display-name";
import { serializeLastSeen } from "@/features/chat/utils/presence";
import type { BubbleMeta } from "@/features/chat-bubbles/types";
import {
  bubbleHrefs,
  bubbleKeyFor,
} from "@/features/chat-bubbles/utils/bubble-links";
import {
  adminActorKey,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

// What the bubble host needs for the trainee's one chat: the coach. Chat off
// or no conversation yet: nothing to open.
export const loadCoachBubble = async (user: {
  id: number;
  chatEnabled: boolean | null;
}): Promise<BubbleMeta[]> => {
  const conversation = await findConversationByUserId(user.id);

  if (!isChatEnabled(user) || !conversation) {
    return [];
  }
  const key = bubbleKeyFor("user", user.id);
  const hrefs = bubbleHrefs("user", key);
  const [t, profile, latest, teamLastSeen] = await Promise.all([
    getTranslations("chat.shared"),
    loadChatProfile(conversation.id, userActorKey(user.id)),
    findLatestAdminSender(conversation.id),
    // Respects each PT's "Trạng thái hoạt động" switch.
    getAdminTeamLastSeen(),
  ]);
  const avatars = latest?.id ? await listAdminAvatarUrls() : null;

  if (!hrefs) {
    return [];
  }
  return [
    {
      key,
      userId: user.id,
      name: adminLabel(
        profile.nicknames,
        null,
        latest?.name ?? t("fallbackPeer"),
        "pt",
      ),
      avatarSrc: (latest?.id ? avatars?.get(latest.id) : null) ?? null,
      lastSeenAt: serializeLastSeen(teamLastSeen),
      ...hrefs,
    },
  ];
};

// One bubble per trainee id this admin may open and that has a writable chat;
// unknown, hidden and out-of-scope ids are left out.
export const loadTraineeBubbles = async (
  adminId: number,
  userIds: readonly number[],
): Promise<BubbleMeta[]> => {
  const rows = await Promise.all(
    userIds.map(async (userId): Promise<BubbleMeta | null> => {
      const user = await findUserById(userId);

      if (
        !user ||
        !isChatEnabled(user) ||
        !(await canAdminAccessUser(adminId, user.id))
      ) {
        return null;
      }
      const conversation = await findConversationByUserId(user.id);
      const key = bubbleKeyFor("admin", user.id);
      const hrefs = bubbleHrefs("admin", key);

      if (!conversation || !hrefs) {
        return null;
      }
      const [profile, avatarSrc] = await Promise.all([
        loadChatProfile(conversation.id, adminActorKey(adminId)),
        getAvatarUrl("user", user.id),
      ]);

      return {
        key,
        userId: user.id,
        name: displayNameFor(profile.nicknames, "user", user.name),
        avatarSrc,
        lastSeenAt: serializeLastSeen(user.lastSeenAt ?? null),
        ...hrefs,
      };
    }),
  );

  return rows.flatMap((row) => (row ? [row] : []));
};

// `?ids=1,2`: plain positive ids, deduped, at most `max`.
export const parseIdList = (raw: string | null, max: number) => {
  const ids = (raw ?? "")
    .split(",")
    .filter((part) => /^[1-9]\d{0,14}$/.test(part))
    .map(Number);

  return [...new Set(ids)].slice(0, max);
};
