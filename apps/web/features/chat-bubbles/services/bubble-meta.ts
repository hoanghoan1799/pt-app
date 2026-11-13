import "server-only";

import { askApi, type Asked } from "@/features/chat/services/chat-api";
import { webizeUrls } from "@/features/chat/utils/api-urls";
import type { BubbleMeta } from "@/features/chat-bubbles/types";
import {
  bubbleHrefs,
  bubbleKeyFor,
} from "@/features/chat-bubbles/utils/bubble-links";

type ApiBubble = {
  userId: number;
  conversationId: number;
  name: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
};

const toBubbles = (role: "user" | "admin", bubbles: ApiBubble[]) =>
  webizeUrls(bubbles).flatMap((bubble): BubbleMeta[] => {
    const key = bubbleKeyFor(role, bubble.userId);
    const hrefs = bubbleHrefs(role, key);

    return hrefs
      ? [
          {
            key,
            userId: bubble.userId,
            name: bubble.name,
            avatarSrc: bubble.avatarUrl,
            lastSeenAt: bubble.lastSeenAt,
            ...hrefs,
          },
        ]
      : [];
  });

// What the bubble host needs for the trainee's one chat: the coach. Chat off
// or no conversation yet: the API sends nothing, so there is nothing to open.
export const loadCoachBubble = async (): Promise<Asked<BubbleMeta[]>> => {
  const asked = await askApi("user", (api) => api.GET("/v1/chat/bubbles"));

  return asked.ok
    ? { ...asked, data: toBubbles("user", asked.data.bubbles) }
    : asked;
};

// One bubble per trainee id this admin may open and that has a writable chat;
// unknown, hidden and out-of-scope ids are left out by the API.
export const loadTraineeBubbles = async (
  userIds: readonly number[],
): Promise<Asked<BubbleMeta[]>> => {
  if (userIds.length === 0) {
    return { ok: true, status: 200, data: [] };
  }
  const asked = await askApi("admin", (api) =>
    api.GET("/v1/chat/bubbles", {
      params: { query: { ids: userIds.join(",") } },
    }),
  );

  return asked.ok
    ? { ...asked, data: toBubbles("admin", asked.data.bubbles) }
    : asked;
};

// `?ids=1,2`: plain positive ids, deduped, at most `max`.
export const parseIdList = (raw: string | null, max: number) => {
  const ids = (raw ?? "")
    .split(",")
    .filter((part) => /^[1-9]\d{0,14}$/.test(part))
    .map(Number);

  return [...new Set(ids)].slice(0, max);
};
