import type { AvatarMime } from "@pt/contracts";

// The port the services talk to. Avatars live behind it so moving the bytes to
// R2/MinIO later is a new adapter, not a change in the services.
export const FILE_STORAGE = Symbol("FILE_STORAGE");

export type FileRef = {
  collection: "avatar-user" | "avatar-admin";
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
  remove(ref: FileRef): Promise<void>;
}
