import "server-only";

import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { chatConversations, chatPhotos } from "@/db/schema";
import {
  PHOTO_PENDING_TTL_MS,
  type PhotoMime,
} from "@/features/chat/utils/photo-rules";
import { canAdminAccessUser } from "@/services/hidden-users";

// Photos in chat (KAN-160): storage and access rules. The uploader and the
// conversation always come from the session, never from the client.

export const photoUploaderKey = (
  who: { kind: "user" } | { kind: "admin"; id: number },
) => (who.kind === "user" ? "user" : `admin:${who.id}`);

// Uploads that never became a message (the person backed out) are dropped when
// the next upload comes in, so they cannot pile up.
const purgeStalePending = (now: Date) =>
  db
    .delete(chatPhotos)
    .where(
      and(
        isNull(chatPhotos.messageId),
        lt(
          chatPhotos.createdAt,
          new Date(now.getTime() - PHOTO_PENDING_TTL_MS),
        ),
      ),
    );

export const createPendingPhoto = async (
  input: {
    conversationId: number;
    uploaderKey: string;
    mime: PhotoMime;
    width: number;
    height: number;
    bytes: Uint8Array;
  },
  now = new Date(),
) => {
  await purgeStalePending(now);
  const [row] = await db
    .insert(chatPhotos)
    .values({
      conversationId: input.conversationId,
      uploaderKey: input.uploaderKey,
      mime: input.mime,
      width: input.width,
      height: input.height,
      data: Buffer.from(input.bytes),
      size: input.bytes.length,
      createdAt: now,
    })
    .returning({ id: chatPhotos.id });

  return row.id;
};

// A photo may be attached once, by the person who uploaded it, to a message in
// the conversation it was uploaded for.
export const isPhotoAttachable = async (
  photoId: number,
  conversationId: number,
  uploaderKey: string,
) => {
  const [row] = await db
    .select({ id: chatPhotos.id })
    .from(chatPhotos)
    .where(
      and(
        eq(chatPhotos.id, photoId),
        eq(chatPhotos.conversationId, conversationId),
        eq(chatPhotos.uploaderKey, uploaderKey),
        isNull(chatPhotos.messageId),
      ),
    );

  return Boolean(row);
};

export const attachPhotoToMessage = async (
  photoId: number,
  messageId: number,
) => {
  await db
    .update(chatPhotos)
    .set({ messageId })
    .where(and(eq(chatPhotos.id, photoId), isNull(chatPhotos.messageId)));
};

// Unsend: the stored image goes with the message.
export const deletePhotoOfMessage = async (messageId: number) => {
  await db.delete(chatPhotos).where(eq(chatPhotos.messageId, messageId));
};

export type PhotoViewer = { kind: "user" | "admin"; id: number };

// The trainee of the conversation, and any admin who can access that trainee
// (a hidden one only after the passcode reveal). Only photos that belong to a
// message are served; a pending upload is not visible to anyone.
export const findPhotoForViewer = async (id: number, viewer: PhotoViewer) => {
  const [photo] = await db
    .select({
      mime: chatPhotos.mime,
      data: chatPhotos.data,
      traineeId: chatConversations.userId,
    })
    .from(chatPhotos)
    .innerJoin(
      chatConversations,
      eq(chatConversations.id, chatPhotos.conversationId),
    )
    .where(and(eq(chatPhotos.id, id), isNotNull(chatPhotos.messageId)));

  if (!photo) {
    return null;
  }
  const allowed =
    viewer.kind === "user"
      ? photo.traineeId === viewer.id
      : await canAdminAccessUser(viewer.id, photo.traineeId);

  return allowed ? { mime: photo.mime, data: photo.data } : null;
};
