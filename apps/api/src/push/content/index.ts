import { buildNotificationPush } from "../../social/notifications/notification-content.js";
import { buildChatMessagePush, buildChatReactionPush } from "./chat-content.js";
import { buildGroupMessagePush } from "./group-content.js";
import { buildReportPush } from "./report-content.js";

// Notification content strategy: one builder per kind of push, each turning
// the facts of an event into `{ title, body, url, tag }` in the recipient's
// language. Social kinds are built by the Social module's own builders
// (friend_request, friend_accepted, post_reaction, post_comment, admin_post);
// `report` goes to the super admins when a report is filed.
// A new kind of push is one new entry here.
export const pushContent = {
  chat_message: buildChatMessagePush,
  chat_reaction: buildChatReactionPush,
  group_message: buildGroupMessagePush,
  report: buildReportPush,
  social: buildNotificationPush,
} as const;

export * from "./chat-content.js";
export * from "./group-content.js";
export * from "./report-content.js";
