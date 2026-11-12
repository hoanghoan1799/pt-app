import { type NextRequest, NextResponse } from "next/server";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  fetchGiphyStickers,
  isGiphyEnabled,
} from "@/features/chat/services/giphy";
import {
  createRateLimiter,
  GIPHY_RATE_LIMIT,
  GIPHY_RATE_WINDOW_MS,
  normalizeGiphyQuery,
} from "@/features/chat/utils/giphy-rules";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

const allow = createRateLimiter(GIPHY_RATE_LIMIT, GIPHY_RATE_WINDOW_MS);

// GIPHY search and trending for the sticker picker (KAN-144). The caller must
// be a signed-in trainee (chat unlocked) or an admin. The API key stays on the
// server. Without GIPHY_API_KEY the answer is 200 { enabled: false } so the
// client hides the tab. `?q=` empty means trending.
export const GET = async (request: NextRequest) => {
  const admin = await getApiAdmin();
  const user = admin ? null : await getApiUser();

  if (!admin && !user) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (user && !isChatEnabled(user)) {
    return reply({ error: "chat_locked" }, 403);
  }
  if (!isGiphyEnabled()) {
    return reply({ enabled: false, stickers: [] }, 200);
  }
  const query = normalizeGiphyQuery(request.nextUrl.searchParams.get("q"));

  if (query === null) {
    return reply({ error: "invalid_query" }, 400);
  }
  if (!allow(admin ? `admin:${admin.id}` : `user:${user?.id}`)) {
    return reply({ error: "rate_limited" }, 429);
  }
  try {
    return reply(
      { enabled: true, stickers: await fetchGiphyStickers(query) },
      200,
    );
  } catch (error) {
    logServerError("giphyStickers", error);
    return reply({ enabled: true, error: "giphy_unavailable" }, 502);
  }
};
