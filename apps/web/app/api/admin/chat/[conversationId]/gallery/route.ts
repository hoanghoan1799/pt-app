import type { NextRequest } from "next/server";
import { z } from "zod";

import { routeData, routeInvalid } from "@/features/chat/services/chat-api";
import { askConversationGallery } from "@/features/chat/services/chat-gallery";
import {
  parseGalleryCursor,
  parseGalleryTab,
} from "@/features/chat/utils/gallery-rules";

const conversationIdSchema = z.coerce.number().int().positive();

// GET: one page of a conversation's photos, stickers or links (`?tab=`),
// newest first (KAN-160). The API answers 404 for a conversation the admin may
// not read.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
  const id = conversationIdSchema.safeParse((await params).conversationId);
  const cursor = parseGalleryCursor(request.nextUrl.searchParams.get("before"));

  if (!id.success || !cursor.ok) {
    return routeInvalid();
  }
  return routeData(
    await askConversationGallery(
      id.data,
      parseGalleryTab(request.nextUrl.searchParams.get("tab")),
      cursor.before,
    ),
  );
};
