import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";

const idSchema = z.coerce.number().int().positive();

// Previous bodies of a message in the caller's conversation (KAN-138, spec C4:
// both people see the history). In Next 16 `params` is a Promise. The API
// answers "not found" for a message of another conversation.
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) => {
  const messageId = idSchema.safeParse((await params).messageId);

  if (!messageId.success) {
    return routeInvalid();
  }
  return routeData(
    await askApi("user", (api) =>
      api.GET("/v1/chat/messages/{mid}/edits", {
        params: { path: { mid: messageId.data } },
      }),
    ),
  );
};
