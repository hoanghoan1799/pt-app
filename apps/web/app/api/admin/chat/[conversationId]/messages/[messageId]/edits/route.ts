import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";

const idSchema = z.coerce.number().int().positive();

// Previous bodies of a message (spec C4). The API finds the conversation from
// the message and checks the admin may read it. In Next 16 `params` is a
// Promise.
export const GET = async (
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; messageId: string }> },
) => {
  const ids = await params;
  const messageId = idSchema.safeParse(ids.messageId);

  if (!idSchema.safeParse(ids.conversationId).success || !messageId.success) {
    return routeInvalid();
  }
  return routeData(
    await askApi("admin", (api) =>
      api.GET("/v1/chat/messages/{mid}/edits", {
        params: { path: { mid: messageId.data } },
      }),
    ),
  );
};
