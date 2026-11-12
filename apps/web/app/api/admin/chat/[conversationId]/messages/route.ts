import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";
import { threadQueryOf } from "@/features/chat/utils/chat-query";

const conversationIdSchema = z.coerce.number().int().positive();

// Any admin may read any conversation of a trainee they can open (shared PT
// inbox, D4); the API answers 404 for the rest, hidden trainees included. In
// Next 16 `params` is a Promise.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
  const id = conversationIdSchema.safeParse((await params).conversationId);

  if (!id.success) {
    return routeInvalid();
  }
  return routeData(
    await askApi("admin", (api) =>
      api.GET("/v1/chat/conversations/{cid}/messages", {
        params: {
          path: { cid: id.data },
          query: threadQueryOf(request.nextUrl.searchParams),
        },
      }),
    ),
  );
};
