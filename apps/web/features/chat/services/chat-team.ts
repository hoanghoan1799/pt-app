import "server-only";

import { cache } from "react";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import { callApi } from "@/services/api/call";

// The PT team as the chat screens draw it (GET /v1/chat/team): who has a
// photo and who has the blue tick. One request per page render and actor.
const loadTeam = cache(
  async (actor: "user" | "admin") =>
    webizeUrls(await callApi(actor, (api) => api.GET("/v1/chat/team"))).admins,
);

// Versioned photo URL of every PT who has one, keyed by admin id.
export const listAdminAvatarUrls = async (
  actor: "user" | "admin",
): Promise<Map<number, string>> =>
  new Map(
    (await loadTeam(actor)).flatMap((admin) =>
      admin.avatarUrl ? [[admin.id, admin.avatarUrl] as const] : [],
    ),
  );

// Ids of the admins with the blue tick.
export const listVerifiedAdminIds = async (
  actor: "user" | "admin",
): Promise<number[]> =>
  (await loadTeam(actor)).flatMap((admin) =>
    admin.verified ? [admin.id] : [],
  );
