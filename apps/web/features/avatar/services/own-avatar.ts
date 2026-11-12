import "server-only";

import { cache } from "react";

import { toWebAvatarUrl } from "@/features/avatar/utils/avatar-rules";
import { callApi } from "@/services/api/call";

// The signed-in person's own photo URL (versioned, served by app/api/avatar),
// or null. Asked once per request: the header and the page share one call.
export const getOwnAvatarUrl = cache(
  async (role: "user" | "admin"): Promise<string | null> => {
    const profile =
      role === "admin"
        ? await callApi("admin", (api) => api.GET("/v1/admins/me"))
        : await callApi("user", (api) => api.GET("/v1/users/me"));

    return toWebAvatarUrl(profile.avatarUrl);
  },
);
