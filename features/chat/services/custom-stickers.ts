import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  chatConversations,
  chatCustomStickers,
  chatMessages,
} from "@/db/schema";
import {
  CUSTOM_STICKER_MAX_PER_OWNER,
  type CustomStickerMime,
  customStickerRef,
} from "@/features/chat/utils/custom-sticker-rules";

// Personal stickers (KAN-158): storage and access rules. The owner is always
// taken from the session by the caller, never from the client.
export interface StickerOwner {
  kind: "user" | "admin";
  id: number;
}

const isOwnedBy = (owner: StickerOwner) =>
  and(
    eq(chatCustomStickers.ownerKind, owner.kind),
    eq(chatCustomStickers.ownerId, owner.id),
    isNull(chatCustomStickers.deletedAt),
  );

export const listOwnStickers = async (owner: StickerOwner) => {
  const rows = await db
    .select({ id: chatCustomStickers.id })
    .from(chatCustomStickers)
    .where(isOwnedBy(owner))
    .orderBy(desc(chatCustomStickers.id));

  return rows.map((row) => row.id);
};

export type CreateStickerResult =
  { status: "created"; id: number } | { status: "limit" };

// A full set rejects the new image rather than silently dropping an old one:
// an old sticker may be the one the person is still using.
export const createOwnSticker = async (
  owner: StickerOwner,
  image: { mime: CustomStickerMime; bytes: Uint8Array },
  now = new Date(),
): Promise<CreateStickerResult> => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(chatCustomStickers)
    .where(isOwnedBy(owner));

  if (total >= CUSTOM_STICKER_MAX_PER_OWNER) {
    return { status: "limit" };
  }
  const [row] = await db
    .insert(chatCustomStickers)
    .values({
      ownerKind: owner.kind,
      ownerId: owner.id,
      mime: image.mime,
      data: Buffer.from(image.bytes),
      size: image.bytes.length,
      createdAt: now,
    })
    .returning({ id: chatCustomStickers.id });

  return { status: "created", id: row.id };
};

// True when the sender owns a live (not removed) sticker with this id.
export const ownsSticker = async (owner: StickerOwner, id: number) => {
  const [row] = await db
    .select({ id: chatCustomStickers.id })
    .from(chatCustomStickers)
    .where(and(eq(chatCustomStickers.id, id), isOwnedBy(owner)));

  return Boolean(row);
};

const isSentInAnyMessage = async (id: number) => {
  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.stickerRef, customStickerRef(id)))
    .limit(1);

  return Boolean(row);
};

// Removing a sticker that was already sent only hides it from the owner's
// list (the bubbles keep their picture); an unsent one is really deleted.
// Someone else's id, or an unknown one, is "not found".
export const deleteOwnSticker = async (owner: StickerOwner, id: number) => {
  if (!(await ownsSticker(owner, id))) {
    return false;
  }
  if (await isSentInAnyMessage(id)) {
    await db
      .update(chatCustomStickers)
      .set({ deletedAt: new Date() })
      .where(eq(chatCustomStickers.id, id));
  } else {
    await db.delete(chatCustomStickers).where(eq(chatCustomStickers.id, id));
  }
  return true;
};

export type Viewer = { kind: "user" | "admin"; id: number };

// Who may see the picture: its owner (while it is in their list), and the
// other side of a conversation it was sent in. A PT is part of every
// conversation, a trainee only of their own. An unsent message no longer
// grants access.
export const findStickerForViewer = async (id: number, viewer: Viewer) => {
  const [sticker] = await db
    .select({
      id: chatCustomStickers.id,
      mime: chatCustomStickers.mime,
      data: chatCustomStickers.data,
      ownerKind: chatCustomStickers.ownerKind,
      ownerId: chatCustomStickers.ownerId,
      deletedAt: chatCustomStickers.deletedAt,
    })
    .from(chatCustomStickers)
    .where(eq(chatCustomStickers.id, id));

  if (!sticker) {
    return null;
  }
  const isOwner =
    sticker.ownerKind === viewer.kind &&
    sticker.ownerId === viewer.id &&
    sticker.deletedAt === null;

  if (!isOwner) {
    const sent = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .innerJoin(
        chatConversations,
        eq(chatConversations.id, chatMessages.conversationId),
      )
      .where(
        and(
          eq(chatMessages.stickerRef, customStickerRef(id)),
          isNull(chatMessages.deletedAt),
          viewer.kind === "user"
            ? eq(chatConversations.userId, viewer.id)
            : undefined,
        ),
      )
      .limit(1);

    if (sent.length === 0) {
      return null;
    }
  }
  return { mime: sticker.mime, data: sticker.data };
};
