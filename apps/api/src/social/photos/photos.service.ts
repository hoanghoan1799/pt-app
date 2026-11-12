import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  SOCIAL_PHOTO_PENDING_TTL_MS,
  SOCIAL_POST_PHOTO_MAX_BYTES,
  type SocialAuthorKind,
  type SocialPostPrivacy,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../../common/clock.js";
import { checkPhoto } from "../domain/photo-check.js";
import { MAX_ID, PostAccess } from "../post-access.service.js";
import { badImage, photoNotFound, photoTooLarge } from "../social.errors.js";
import { keyOf, type SocialActor } from "../social-actor.js";
import { SocialPhotoStorage, type StoredPhoto } from "./social-photo-storage.js";

// Photos of posts: validation, upload and access. The uploader comes from the
// session, never from the request.
@Injectable()
export class PhotosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: SocialPhotoStorage,
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

    await this.storage.deleteStale(
      new Date(now.getTime() - SOCIAL_PHOTO_PENDING_TTL_MS),
    );
    return this.storage.put(
      {
        uploaderKey: keyOf(actor),
        mime: check.mime,
        width: check.width,
        height: check.height,
        bytes,
      },
      now,
    );
  }

  // The photo bytes, only when the photo belongs to a live post the viewer may
  // see. A pending upload or a deleted post is visible to no one.
  async findForViewer(
    viewer: SocialActor,
    photoId: number,
  ): Promise<StoredPhoto> {
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
    const stored = await this.storage.get(photoId);

    if (!stored) {
      throw photoNotFound();
    }
    return stored;
  }
}
