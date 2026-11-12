import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  actorOf,
  askApi,
  routeError,
  routeNoContent,
} from "@/features/chat/services/chat-api";

const NO_STORE = { "Cache-Control": "no-store" };

const subscriptionSchema = z.object({
  endpoint: z.string().min(1).max(2048),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const endpointSchema = z.object({ endpoint: z.string().min(1).max(2048) });

const readJson = async (request: NextRequest) => {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
};

const invalid = (error: string) =>
  NextResponse.json({ error }, { status: 400, headers: NO_STORE });

// Same role rule as the realtime ticket: a browser may hold both cookies, so
// the admin owner is only used when asked for with `?as=admin`. Any signed-in
// trainee or admin may subscribe: push only ever fires for chat messages
// addressed to them.
export const POST = async (request: NextRequest) => {
  const parsed = subscriptionSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return invalid("invalid_subscription");
  }
  const asked = await askApi(actorOf(request), (api) =>
    api.POST("/v1/push/subscriptions", {
      body: { kind: "web", ...parsed.data },
      headers: { "user-agent": request.headers.get("user-agent") ?? "" },
    } as never),
  );

  return asked.ok ? routeNoContent() : routeError(asked.error);
};

export const DELETE = async (request: NextRequest) => {
  const parsed = endpointSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return invalid("invalid_endpoint");
  }
  const asked = await askApi(actorOf(request), (api) =>
    api.DELETE("/v1/push/subscriptions", { body: parsed.data }),
  );

  return asked.ok ? routeNoContent() : routeError(asked.error);
};
