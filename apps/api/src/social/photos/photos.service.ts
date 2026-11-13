import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  SOCIAL_PHOTO_PENDING_TTL_MS,
  SOCIAL_POST_PHOTO_MAX_BYTES,
  type SocialAuthorKind,
  type SocialPostPrivacy,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../../common/clock.js";
import {
  FILE_STORAGE,
  type FileStorage,
  type StoredFile,
} from "../../files/file-storage.js";
import { checkPhoto } from "../domain/photo-check.js";
import { MAX_ID, PostAccess } from "../post-access.service.js";
import { badImage, photoNotFound, photoTooLarge } from "../social.errors.js";
import { keyOf, type SocialActor } from "../social-actor.js";

// Photos of posts: validation, upload and access. The uploader comes from the
// session, never from the request.
@Injectable()
export class PhotosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly access: PostAccess,
    private readonly clock: Clock,
  ) {}

  // The raw image bytes. Type and size are read from the bytes; the photo stays
  // pending until a post uses it. Uploads that never became a post are dropped
  // when the next upload arrives.
  async upload(actor: SocialActor, bytes: Uint8Array): Promise<number> {
    if (bytes.length > SOCIAL_POST_PHOTO_MAX_BYTES) {
      throw photoTooLarge();
    }
    const check = checkPhoto(bytes);

    if (!check.ok) {
      throw check.error === "too_large" ? photoTooLarge() : badImage();
    }
    const now = this.clock.now();

    await this.dataSource.query(
      `DELETE FROM social_post_photos WHERE post_id IS NULL AND created_at < $1`,
      [new Date(now.getTime() - SOCIAL_PHOTO_PENDING_TTL_MS)],
    );
    // The row (uploader, picture size) first, then the bytes through the
    // shared storage, as chat photos do.
    const inserted: { id: number }[] = await this.dataSource.query(
      `INSERT INTO social_post_photos
         (uploader_key, mime, width, height, data, size, created_at)
       VALUES ($1, $2, $3, $4, ''::bytea, 0, $5) RETURNING id`,
      [keyOf(actor), check.mime, check.width, check.height, now],
    );
    const id = inserted[0].id;

    try {
      await this.storage.put(
        { collection: "social-photo", id },
        { mime: check.mime, bytes: Buffer.from(bytes) },
      );
    } catch (error) {
      await this.storage.remove({ collection: "social-photo", id });
      throw error;
    }
    return id;
  }

  // The photo bytes, only when the photo belongs to a live post the viewer may
  // see. A pending upload or a deleted post is visible to no one.
  async findForViewer(
    viewer: SocialActor,
    photoId: number,
  ): Promise<StoredFile> {
    if (!Number.isInteger(photoId) || photoId < 1 || photoId > MAX_ID) {
      throw photoNotFound();
    }
    const rows: {
      author_kind: SocialAuthorKind;
      author_id: number;
      privacy: SocialPostPrivacy;
    }[] = await this.dataSource.query(
      `SELECT p.author_kind, p.author_id, p.privacy
       FROM social_post_photos ph
       JOIN social_posts p ON p.id = ph.post_id
       WHERE ph.id = $1 AND p.deleted_at IS NULL`,
      [photoId],
    );
    const row = rows[0];

    if (
      !row ||
      !(await this.access.canSee(viewer, {
        kind: row.author_kind,
        id: row.author_id,
        privacy: row.privacy,
      }))
    ) {
      throw photoNotFound();
    }
    const stored = await this.storage.get({
      collection: "social-photo",
      id: photoId,
    });

    if (!stored) {
      throw photoNotFound();
    }
    return stored;
  }
}
