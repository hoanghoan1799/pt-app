import type { NextRequest } from "next/server";

import { routeData, routeInvalid } from "@/features/chat/services/chat-api";
import { askMyGallery } from "@/features/chat/services/chat-gallery";
import {
  parseGalleryCursor,
  parseGalleryTab,
} from "@/features/chat/utils/gallery-rules";

// GET: one page of the photos in the trainee's own conversation, newest
// first (KAN-160); `?tab=photos|stickers|links` picks the list. Never takes a
// conversation id.
export const GET = async (request: NextRequest) => {
  const cursor = parseGalleryCursor(request.nextUrl.searchParams.get("before"));

  if (!cursor.ok) {
    return routeInvalid();
  }
  return routeData(
    await askMyGallery(
      parseGalleryTab(request.nextUrl.searchParams.get("tab")),
      cursor.before,
    ),
  );
};
