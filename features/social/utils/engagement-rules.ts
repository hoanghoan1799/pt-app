import { z } from "zod";

import { CHAT_REACTION_EMOJIS } from "@/features/chat/utils/chat-rules";
import {
  COMMENT_MAX_LENGTH,
  PUSH_COMMENT_PREVIEW_LENGTH,
  REACTION_PUSH_INTERVAL_MS,
  REACTION_SUMMARY_TOP,
  SOCIAL_MESSAGES,
} from "@/features/social/constants/social";
import type {
  NotificationKind,
  PostAuthorRef,
  ReactionSummary,
  SocialActor,
} from "@/features/social/types/social";
import { actorKey, isSameAuthor } from "@/features/social/utils/post-rules";
import { getPushTranslator } from "@/i18n/push-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

const idSchema = z.number().int().positive();

// Same six emoji as chat; null removes my reaction.
export const reactSchema = z.object({
  postId: idSchema,
  emoji: z
    .enum(CHAT_REACTION_EMOJIS, SOCIAL_MESSAGES.REACTION_INVALID)
    .nullable(),
});

export const commentBodySchema = z
  .string()
  .trim()
  .min(1, SOCIAL_MESSAGES.COMMENT_EMPTY)
  .max(COMMENT_MAX_LENGTH, SOCIAL_MESSAGES.COMMENT_TOO_LONG);

export const addCommentSchema = z.object({
  postId: idSchema,
  body: commentBodySchema,
});

export const editCommentSchema = z.object({
  commentId: idSchema,
  body: commentBodySchema,
});

export const commentIdSchema = idSchema;

// The comment's author edits their own comment, nobody else.
export const canEditComment = (actor: SocialActor, authorKey: string) =>
  actorKey(actor) === authorKey;

// The comment's author, the author of the post and a super admin delete it.
export const canDeleteComment = (
  actor: SocialActor,
  comment: { authorKey: string },
  post: PostAuthorRef,
) =>
  actorKey(actor) === comment.authorKey ||
  isSameAuthor(actor, post) ||
  (actor.kind === "admin" && actor.role === "super_admin");

export const reactorKeyOf = actorKey;

export const parseActorKey = (key: string): PostAuthorRef | null => {
  const [kind, rawId] = key.split(":");
  const id = Number(rawId);

  return (kind === "user" || kind === "admin") && Number.isSafeInteger(id)
    ? { kind, id }
    : null;
};

// Reaction rows -> the line under a post: top emoji, total, and my own.
export const summarizeReactions = (
  reactions: { reactorKey: string; emoji: string }[],
  myKey: string,
): ReactionSummary => {
  const byEmoji = new Map<string, number>();
  let mine: string | null = null;

  for (const reaction of reactions) {
    byEmoji.set(reaction.emoji, (byEmoji.get(reaction.emoji) ?? 0) + 1);
    if (reaction.reactorKey === myKey) {
      mine = reaction.emoji;
    }
  }
  const counts = [...byEmoji.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);

  return {
    counts: counts.slice(0, REACTION_SUMMARY_TOP),
    total: reactions.length,
    mine,
  };
};

// Optimistic update of a summary when I pick `next` (null = remove).
export const applyReaction = (
  summary: ReactionSummary,
  next: string | null,
): ReactionSummary => {
  const all = new Map(summary.counts.map((item) => [item.emoji, item.count]));

  if (summary.mine) {
    all.set(summary.mine, (all.get(summary.mine) ?? 1) - 1);
  }
  if (next) {
    all.set(next, (all.get(next) ?? 0) + 1);
  }
  const counts = [...all.entries()]
    .filter(([, count]) => count > 0)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);
  const total = summary.total - (summary.mine ? 1 : 0) + (next ? 1 : 0);

  return { counts: counts.slice(0, REACTION_SUMMARY_TOP), total, mine: next };
};

// Spec R7: a reaction push goes out only when none went out for this
// recipient and post within the last hour.
export const shouldPushReaction = (
  lastPushedAt: Date | null,
  now: Date,
): boolean =>
  lastPushedAt === null ||
  now.getTime() - lastPushedAt.getTime() >= REACTION_PUSH_INTERVAL_MS;

export const notificationText = (
  kind: NotificationKind,
  actorName: string,
  locale: Locale = DEFAULT_LOCALE,
): string => {
  const t = getPushTranslator(locale);

  switch (kind) {
    case "post_reaction":
      return t("social.postReaction", { name: actorName });
    case "post_comment":
      return t("social.postComment", { name: actorName });
    case "friend_request":
      return t("social.friendRequest", { name: actorName });
    case "friend_accepted":
      return t("social.friendAccepted", { name: actorName });
  }
};

export const previewComment = (body: string) => {
  const flat = body.replace(/\s+/g, " ").trim();

  return flat.length > PUSH_COMMENT_PREVIEW_LENGTH
    ? `${flat.slice(0, PUSH_COMMENT_PREVIEW_LENGTH)}…`
    : flat;
};

export const postPath = (id: number) => `/post/${id}`;
export const adminPostPath = (id: number) => `/admin/social/post/${id}`;

export const postPathFor = (recipientKey: string, postId: number) =>
  recipientKey.startsWith("admin:") ? adminPostPath(postId) : postPath(postId);

export interface SocialPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export const buildReactionPush = (
  actorName: string,
  recipientKey: string,
  postId: number,
  locale: Locale = DEFAULT_LOCALE,
): SocialPushPayload => ({
  title: "PT App",
  body: notificationText("post_reaction", actorName, locale),
  url: postPathFor(recipientKey, postId),
  tag: `social-react-${postId}`,
});

export const buildCommentPush = (
  actorName: string,
  recipientKey: string,
  postId: number,
  body: string,
  locale: Locale = DEFAULT_LOCALE,
): SocialPushPayload => ({
  title: "PT App",
  body: getPushTranslator(locale)("social.commented", {
    name: actorName,
    preview: previewComment(body),
  }),
  url: postPathFor(recipientKey, postId),
  tag: `social-comment-${postId}`,
});

export const FRIENDS_PATH = "/friends";
export const FRIEND_REQUESTS_PATH = "/friends?tab=requests";

// Where a notification leads: friend events go to /friends, the rest to the
// post (null when it has none).
export const notificationHref = (
  kind: NotificationKind,
  recipientKey: string,
  postId: number | null,
): string | null => {
  if (kind === "friend_request") {
    return FRIEND_REQUESTS_PATH;
  }
  if (kind === "friend_accepted") {
    return FRIENDS_PATH;
  }
  return postId === null ? null : postPathFor(recipientKey, postId);
};

export const buildFriendPush = (
  kind: "friend_request" | "friend_accepted",
  actorName: string,
  locale: Locale = DEFAULT_LOCALE,
): SocialPushPayload => ({
  title: "PT App",
  body: notificationText(kind, actorName, locale),
  url: kind === "friend_request" ? FRIEND_REQUESTS_PATH : FRIENDS_PATH,
  tag: `social-${kind}`,
});
