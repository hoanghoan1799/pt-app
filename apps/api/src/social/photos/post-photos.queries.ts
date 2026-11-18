import { groupPhotosByOwner } from "@pt/contracts";
import type { DataSource } from "typeorm";

export type PostPhotoRow = { id: number; width: number; height: number };

// The photos of many posts in one query, in display order (position, then id;
// a null position counts as 0). A post from before several photos has its one
// photo here too. Sizes only: the bytes are served by GET /v1/social/photos/:id.
export const loadPostPhotos = async (
  dataSource: DataSource,
  postIds: readonly number[],
): Promise<Map<number, PostPhotoRow[]>> => {
  if (postIds.length === 0) {
    return new Map();
  }
  const rows: {
    id: number;
    postId: number;
    position: number | null;
    width: number;
    height: number;
  }[] = await dataSource.query(
    `SELECT id, post_id AS "postId", position, width, height
     FROM social_post_photos WHERE post_id = ANY($1::int[])`,
    [[...new Set(postIds)]],
  );

  return groupPhotosByOwner(
    rows.map((row) => ({ ...row, ownerId: row.postId })),
    postIds,
  );
};
