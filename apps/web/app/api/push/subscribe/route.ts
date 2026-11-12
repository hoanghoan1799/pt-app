import { type NextRequest, NextResponse } from "next/server";

import {
  deleteSubscription,
  saveSubscription,
} from "@/features/chat/services/chat-push";
import {
  adminOwnerKey,
  pushSubscriptionSchema,
  unsubscribeSchema,
  userOwnerKey,
} from "@/features/chat/utils/push-rules";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// Same role rule as /api/chat/ably-token: a browser may hold both cookies, so
// the admin owner is only used when asked for with `?as=admin`.
const resolveOwnerKey = async (request: NextRequest) => {
  if (request.nextUrl.searchParams.get("as") === "admin") {
    const admin = await getApiAdmin();

    return admin ? adminOwnerKey(admin.id) : null;
  }
  const user = await getApiUser();

  return user ? userOwnerKey(user.id) : null;
};

const readJson = async (request: NextRequest) => {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
};

// Any signed-in trainee or admin may subscribe: push only ever fires for chat
// messages addressed to them.
export const POST = async (request: NextRequest) => {
  try {
    const ownerKey = await resolveOwnerKey(request);

    if (!ownerKey) {
      return json({ error: "unauthorized" }, 401);
    }
    const parsed = pushSubscriptionSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return json({ error: "invalid_subscription" }, 400);
    }
    await saveSubscription(
      ownerKey,
      parsed.data,
      request.headers.get("user-agent") ?? "",
    );
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    logServerError("pushSubscribe", error);
    return json({ error: "server_error" }, 500);
  }
};

export const DELETE = async (request: NextRequest) => {
  try {
    const ownerKey = await resolveOwnerKey(request);

    if (!ownerKey) {
      return json({ error: "unauthorized" }, 401);
    }
    const parsed = unsubscribeSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return json({ error: "invalid_endpoint" }, 400);
    }
    await deleteSubscription(ownerKey, parsed.data.endpoint);
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    logServerError("pushUnsubscribe", error);
    return json({ error: "server_error" }, 500);
  }
};
