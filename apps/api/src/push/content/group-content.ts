import {
  groupAdminPath,
  groupPushTag,
  groupUserPath,
  type PushPayload,
} from "@pt/contracts";

import {
  DEFAULT_LOCALE,
  type Locale,
} from "../../social/notifications/notification-content.js";
import { buildPushPreview, type PushRecipientRole } from "./chat-content.js";

// A group message push (company group-push-rules.ts): title = the group,
// body = "<sender>: <preview>" in the recipient's language, one notification
// per group (a newer one replaces the older). The text only goes into the
// payload; it is never logged.
export type GroupMessageFacts = {
  recipientRole: PushRecipientRole;
  groupId: number;
  groupName: string;
  // The sender as the recipient calls them (their nickname, else the real
  // name); empty when the account is gone.
  senderName: string;
  body?: string | null;
  sticker?: boolean;
  photo?: boolean;
  photoCount?: number;
  locale?: Locale;
};

export const buildGroupMessagePush = ({
  recipientRole,
  groupId,
  groupName,
  senderName,
  body,
  sticker = false,
  photo = false,
  photoCount = 1,
  locale = DEFAULT_LOCALE,
}: GroupMessageFacts): PushPayload => {
  const preview = buildPushPreview({
    body,
    sticker,
    photo,
    photoCount,
    locale,
  });

  return {
    title: groupName,
    body: senderName.trim() === "" ? preview : `${senderName}: ${preview}`,
    url:
      recipientRole === "user"
        ? groupUserPath(groupId)
        : groupAdminPath(groupId),
    tag: groupPushTag(groupId),
  };
};
