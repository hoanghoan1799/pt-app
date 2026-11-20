import "server-only";

import type { ActiveRestriction } from "@/features/restrictions/types/restriction";
import { toActiveRestriction } from "@/features/restrictions/utils/restriction-mapping";
import { callApi } from "@/services/api/call";

// The trainee's active block for the admin trainee page (super admin only: the
// API answers 403 to a PT, so the page asks only for a super admin).
export const getTraineeRestriction = async (
  userId: number,
): Promise<ActiveRestriction | null> => {
  const { restriction } = await callApi("admin", (api) =>
    api.GET("/v1/trainees/{userId}/restriction", {
      params: { path: { userId } },
    }),
  );

  return restriction ? toActiveRestriction(restriction) : null;
};
