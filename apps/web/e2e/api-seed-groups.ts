import { withApiDb } from "./api-db";
import { callE2eApi, loginAdminViaApi } from "./api-seed-users";

// Group chat data for the group specs, created through the API's own
// endpoints as the e2e super admin (the create screen itself is covered by its
// own spec). Each spec owns its group by a unique name, so specs and reruns
// never share one.

export const createGroupViaApi = async ({
  name,
  userIds = [],
  ptIds = [],
}: {
  name: string;
  userIds?: number[];
  ptIds?: number[];
}) =>
  (
    await callE2eApi<{ groupId: number }>("POST", "/v1/chat/groups", {
      token: await loginAdminViaApi(),
      body: { name, userIds, ptIds },
    })
  ).groupId;

// Stored real messages of a group (system lines left out), oldest first.
export const getGroupBodies = (groupId: number) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT body FROM chat_group_messages
        WHERE group_id = $1 AND kind = 'message' ORDER BY id`,
      [groupId],
    );

    return result.rows.map((row) => String(row.body));
  });
