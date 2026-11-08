import "server-only";

import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { dmMessages, dmPhotos } from "@/db/schema";
import {
  PHOTO_PENDING_TTL_MS,
  type PhotoMime,
} from "@/features/chat/utils/photo-rules";
import { resolveDmView } from "@/features/social/services/dm-access";
import type { SocialActor } from "@/features/social/types/social";

// Photos of trainee chats: storage and access. The uploader and the
// conversation always come from the session and the database.

const purgeStalePending = (now: Date) =>
  db
    .delete(dmPhotos)
    .where(
      and(
        isNull(dmPhotos.messageId),
        lt(dmPhotos.createdAt, new Date(now.getTime() - PHOTO_PENDING_TTL_MS)),
      ),
    );

export const createPendingDmPhoto = async (
  input: {
    conversationId: number;
    uploaderId: number;
    mime: PhotoMime;
    width: number;
    height: number;
    bytes: Uint8Array;
  },
  now = new Date(),
) => {
  await purgeStalePending(now);
  const [row] = await db
    .insert(dmPhotos)
    .values({
      conversationId: input.conversationId,
      uploaderId: input.uploaderId,
      mime: input.mime,
      width: input.width,
      height: input.height,
      data: Buffer.from(input.bytes),
      size: input.bytes.length,
      createdAt: now,
    })
    .returning({ id: dmPhotos.id });

  return row.id;
};

// Attachable once, by its uploader, to a message of the conversation it was
// uploaded for.
export const isDmPhotoAttachable = async (
  photoId: number,
  conversationId: number,
  uploaderId: number,
) => {
  const [row] = await db
    .select({ id: dmPhotos.id })
    .from(dmPhotos)
    .where(
      and(
        eq(dmPhotos.id, photoId),
        eq(dmPhotos.conversationId, conversationId),
        eq(dmPhotos.uploaderId, uploaderId),
        isNull(dmPhotos.messageId),
      ),
    );

  return Boolean(row);
};

// The bytes, only for a photo of a live message in a conversation the viewer
// may open (members, or a super admin read-only). A pending upload is visible
// to no one.
export const findDmPhotoForViewer = async (
  photoId: number,
  viewer: SocialActor,
) => {
  const [row] = await db
    .select({
      mime: dmPhotos.mime,
      data: dmPhotos.data,
      conversationId: dmPhotos.conversationId,
    })
    .from(dmPhotos)
    .innerJoin(dmMessages, eq(dmMessages.id, dmPhotos.messageId))
    .where(
      and(
        eq(dmPhotos.id, photoId),
        isNotNull(dmPhotos.messageId),
        isNull(dmMessages.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }
  const view = await resolveDmView(row.conversationId, viewer);

  return view ? { mime: row.mime, data: row.data } : null;
};
