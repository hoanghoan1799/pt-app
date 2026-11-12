import type { AvatarMime } from "@pt/contracts";

// The port the services talk to. Images live behind it so moving the bytes to
// R2/MinIO later is a new adapter, not a change in the services.
export const FILE_STORAGE = Symbol("FILE_STORAGE");

// Avatars belong to a user or admin row. The chat collections belong to a row
// the owning service creates first (a chat photo, a personal sticker, a DM
// photo carries its own metadata) and the storage fills with the bytes.
export type FileCollection =
  "avatar-user" | "avatar-admin" | "chat-photo" | "chat-sticker" | "dm-photo";

export type FileRef = {
  collection: FileCollection;
  id: number;
};

export type StoredFile = {
  mime: AvatarMime;
  bytes: Buffer;
  // When it was stored, in whole seconds: the cache version of the file.
  version: Date;
};

export interface FileStorage {
  // Returns the version of the stored file.
  put(ref: FileRef, file: { mime: AvatarMime; bytes: Buffer }): Promise<Date>;
  // Null when there is no file, or the stored value is not a valid image.
  get(ref: FileRef): Promise<StoredFile | null>;
  // Only the version, without reading the bytes.
  version(ref: FileRef): Promise<Date | null>;
  // Avatars: clears the photo. Chat collections: deletes the file and its row.
  remove(ref: FileRef): Promise<void>;
}
