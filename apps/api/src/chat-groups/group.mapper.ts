import { timingSafeEqual } from "node:crypto";

import {
  chatToPreview,
  chatToReplySnippet,
  type GroupMessageView,
  groupSenderTagOf,
  type GroupSummary,
  type GroupSystemEvent,
  parseGroupSystemEvent,
  stickerToView,
} from "@pt/contracts";

import { chatCustomStickerUrl, PHOTO_ALT } from "../chat/chat.mapper.js";
import { avatarToken, avatarVersion } from "../files/image-rules.js";
import type {
  GroupRow,
  MessageRow,
  PhotoRow,
  ReactionRow,
} from "./group.queries.js";
import type { GroupIdentity } from "./group-names.service.js";

// Rows -> contract DTOs. Unsent and hidden messages lose their body, sticker,
// photos (and an unsent one its reactions) here, so every reader gets the
// same redaction (company hydrateMessages).

export const groupPhotoUrl = (groupId: number, photoId: number) =>
  `/v1/chat/groups/${groupId}/photos/${photoId}`;

// The group photo follows the signed avatar scheme of users and admins: the
// URL carries the version and an HMAC over "group:<id>:<version>", and the
// token is the capability to load it.
export const groupAvatarUrl = (
  group: Pick<GroupRow, "id" | "avatarUpdatedAt">,
) => {
  if (!group.avatarUpdatedAt) {
    return null;
  }
  const version = avatarVersion(group.avatarUpdatedAt);

  return `/v1/chat/groups/${group.id}/avatar?v=${version}&t=${avatarToken("group", group.id, version)}`;
};

export const isValidGroupAvatarToken = (
  groupId: number,
  version: string,
  token: unknown,
) => {
  if (typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(avatarToken("group", groupId, version));
  const given = Buffer.from(token);

  return given.length === expected.length && timingSafeEqual(given, expected);
};

export type HydrateContext = {
  viewerKey: string;
  identities: Map<string, GroupIdentity>;
  nameOf: (key: string) => string | null;
  reactions: Map<number, ReactionRow[]>;
  photos: Map<number, PhotoRow[]>;
  replies: Map<number, MessageRow>;
  replyPhotoCounts: Map<number, number>;
  // message id -> members other than the sender who read up to it (own
  // messages only).
  seenCounts: Map<number, number>;
};

const isGone = (row: Pick<MessageRow, "deletedAt" | "hiddenAt">) =>
  row.deletedAt !== null || row.hiddenAt !== null;

const eventOf = (row: MessageRow): GroupSystemEvent | null =>
  row.kind === "system" ? parseGroupSystemEvent(row.systemEvent) : null;

// Most used first, ties in a stable (alphabetical) order.
const toReactions = (rows: ReactionRow[], viewerKey: string) => {
  const counts = new Map<string, number>();

  for (const reaction of rows) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  return [...counts.keys()]
    .sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))
    .map((emoji) => ({
      emoji,
      count: counts.get(emoji)!,
      mine: rows.some((r) => r.emoji === emoji && r.reactorKey === viewerKey),
    }));
};

export const toGroupMessageView = (
  row: MessageRow,
  context: HydrateContext,
  eventKeys: (event: GroupSystemEvent) => string[],
): GroupMessageView => {
  const deleted = row.deletedAt !== null;
  const hidden = row.hiddenAt !== null;
  const showContent = !deleted && !hidden;
  const photos = showContent
    ? (context.photos.get(row.id) ?? []).map((photo) => ({
        id: photo.id,
        url: groupPhotoUrl(row.groupId, photo.id),
        width: photo.width,
        height: photo.height,
        alt: PHOTO_ALT,
      }))
    : [];
  const reply =
    row.replyToMessageId === null
      ? undefined
      : context.replies.get(row.replyToMessageId);
  const event = eventOf(row);

  return {
    id: row.id,
    groupId: row.groupId,
    kind: row.kind,
    senderKey: row.senderKey,
    senderName: row.senderKey ? context.nameOf(row.senderKey) : null,
    senderDeleted:
      row.senderKey !== null && !context.identities.has(row.senderKey),
    senderTag: row.senderKey
      ? groupSenderTagOf(context.identities.get(row.senderKey)?.role)
      : null,
    body: showContent ? row.body : "",
    systemEvent: event,
    audience: row.audience,
    clientId: row.clientId,
    replyTo: reply
      ? {
          id: reply.id,
          senderKey: reply.senderKey,
          senderName: reply.senderKey ? context.nameOf(reply.senderKey) : null,
          snippet: isGone(reply) ? "" : chatToReplySnippet(reply.body),
          unavailable: isGone(reply),
          isSticker: !isGone(reply) && reply.stickerRef !== null,
          isPhoto: !isGone(reply) && reply.photoId !== null,
          photoCount: isGone(reply)
            ? 0
            : (context.replyPhotoCounts.get(reply.id) ?? 0),
        }
      : null,
    sticker: showContent
      ? stickerToView(row.stickerRef, row.stickerUrl, chatCustomStickerUrl)
      : null,
    photo: photos[0] ?? null,
    photos,
    eventNames: Object.fromEntries(
      (event ? eventKeys(event) : []).map((key) => [key, context.nameOf(key)]),
    ),
    silent: row.silent,
    deleted,
    hidden,
    edited: row.editedAt !== null && !deleted,
    reactions: deleted
      ? []
      : toReactions(context.reactions.get(row.id) ?? [], context.viewerKey),
    seenCount: context.seenCounts.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
};

// The inbox line of the last message (company toLastMessage): unsent and
// hidden text never reaches the inbox; photos and stickers carry no text.
export const toLastMessage = (
  row: MessageRow & { photoCount: number },
): NonNullable<GroupSummary["lastMessage"]> => {
  const live = row.kind === "message" && !isGone(row);

  return {
    id: row.id,
    kind: row.kind,
    senderKey: row.senderKey,
    preview: live ? chatToPreview(row.body) : "",
    media: live
      ? row.photoId !== null
        ? "photo"
        : row.stickerRef !== null
          ? "sticker"
          : null
      : null,
    photoCount: live && row.photoId !== null ? Math.max(1, row.photoCount) : 0,
    systemEvent: eventOf(row),
    createdAt: row.createdAt.toISOString(),
  };
};

export const toGroupHeader = (group: GroupRow) => ({
  id: group.id,
  name: group.name,
  avatarUrl: groupAvatarUrl(group),
  managersOnly: group.managersOnly,
  dissolved: group.dissolvedAt !== null,
});
