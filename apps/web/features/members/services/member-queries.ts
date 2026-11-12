import "server-only";

import { toNameKey } from "@pt/contracts";

import type { Member } from "@/features/members/types/member";
import { callApi, tryApi } from "@/services/api/call";

// The trainees this admin may work with, without the ones they hid (KAN-163),
// except `keepUserId` (the one whose page is open, which the admin is allowed
// to see). `name` is what the admin sees: their private nickname if one is set.
// Ordered by real name, like the API's list.
export const listMembers = async (
  _adminId: number,
  keepUserId?: number,
): Promise<Member[]> => {
  const { trainees } = await callApi("admin", (api) => api.GET("/v1/trainees"));
  const members = trainees.map((trainee) => ({
    id: trainee.id,
    name: trainee.displayName,
    key: toNameKey(trainee.name),
  }));

  if (keepUserId !== undefined && !members.some((m) => m.id === keepUserId)) {
    // Hidden but revealed (or just opened): the API answers 404 when the admin
    // may not see this trainee.
    const kept = await tryApi("admin", (api) =>
      api.GET("/v1/trainees/{userId}", {
        params: { path: { userId: keepUserId } },
      }),
    );

    if (kept.ok) {
      members.push({
        id: kept.data.id,
        name: kept.data.displayName,
        key: toNameKey(kept.data.name),
      });
      members.sort((a, b) => a.key.localeCompare(b.key));
    }
  }
  return members.map(({ id, name }) => ({ id, name }));
};
